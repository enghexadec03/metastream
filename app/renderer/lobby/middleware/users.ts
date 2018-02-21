import { Middleware, MiddlewareAPI, Action, Dispatch } from 'redux'
import { actionCreator, isType } from 'utils/redux'
import { Platform } from 'renderer/platform/types'
import { PlatformService } from 'renderer/platform'
import { localUser, NetConnection, NetServer } from 'renderer/network'
import { NetMiddlewareOptions, NetActions } from 'renderer/network/actions'
import { RpcThunk } from '../types'
import { rpc, RpcRealm } from '../../network/middleware/rpc'

interface IUserPayload {
  conn: NetConnection
  name?: string
}

export const addUser = actionCreator<IUserPayload>('ADD_USER')
export const removeUser = actionCreator<string>('REMOVE_USER')
export const clearUsers = actionCreator<string>('CLEAR_USERS')

const usernameCache = new Map<string, string>()

const setUsername = (name: string): RpcThunk<void> => (dispatch, getState, context) => {
  const id = context.client.id.toString()
  const oldName = usernameCache.get(id)

  // Skip update if already cached
  if (oldName === name) {
    return
  }

  dispatch(
    addUser({
      conn: context.client,
      name
    })
  )

  usernameCache.set(id, name)
}
const server_setUsername = rpc(RpcRealm.Server, setUsername)

export const usersMiddleware = (): Middleware => {
  return <S extends Object>(store: MiddlewareAPI<S>) => {
    const { dispatch, getState } = store

    let server: NetServer | null, host: boolean

    const init = (options: NetMiddlewareOptions) => {
      server = options.server
      host = options.host

      if (host) {
        // Add local user as initial user
        dispatch(
          addUser({
            conn: localUser(),
            name: PlatformService.getUserName(localUser().id)
          })
        )

        server.on('connect', (conn: NetConnection) => {
          dispatch(addUser({ conn, name: usernameCache.get(conn.id.toString()) }))
        })

        server.on('disconnect', (conn: NetConnection) => {
          dispatch(removeUser(conn.id.toString()))
        })
      } else {
        server.once('connect', () => {
          const username = PlatformService.getUserName(localUser().id)
          dispatch(server_setUsername(username))
        })
      }
    }

    const destroy = () => {
      server = null
      host = false
      dispatch(clearUsers())
    }

    return (next: Dispatch<S>) => <A extends Action, B>(action: A): B | Action => {
      if (isType(action, NetActions.connect)) {
        init(action.payload)
        return next(<A>action)
      } else if (isType(action, NetActions.disconnect)) {
        destroy()
        return next(<A>action)
      }

      return next(<A>action)
    }
  }
}
