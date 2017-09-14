import { actionCreator } from 'utils/redux';
import { IMediaItem, PlaybackState } from 'lobby/reducers/mediaPlayer';
import { Thunk } from 'types/thunk';
import { ThunkAction } from 'redux-thunk';
import { ILobbyNetState } from 'lobby';
import { rpc, RpcRealm } from 'network/middleware/rpc';
import { RpcThunk } from 'lobby/types';
import { PlatformService } from 'platform';
import { getServiceForUrl } from 'media';
import { MediaThumbnailSize } from 'services/types';
import {
  getCurrentMedia,
  getPlaybackState,
  getPlaybackTime
} from 'lobby/reducers/mediaPlayer.helpers';

export const playPauseMedia = actionCreator<number>('PLAY_PAUSE_MEDIA');
export const nextMedia = actionCreator<void>('NEXT_MEDIA');
export const setMedia = actionCreator<IMediaItem>('SET_MEDIA');
export const endMedia = actionCreator<void>('END_MEDIA');

/** Media timer until playback ends. This assumes only one media player exists at a time.*/
let mediaTimeoutId: number | null = null;

const updatePlaybackTimer = (): ThunkAction<void, ILobbyNetState, void> => {
  return (dispatch, getState) => {
    const state = getState();
    const media = getCurrentMedia(state);
    const playback = getPlaybackState(state);

    if (mediaTimeoutId) {
      clearTimeout(mediaTimeoutId);
      mediaTimeoutId = null;
    }

    if (playback === PlaybackState.Playing) {
      const curTime = getPlaybackTime(state)!;
      const duration = media && media.duration;

      if (duration && duration > 0) {
        const elapsed = duration * 1000 - curTime;

        mediaTimeoutId = setTimeout(() => {
          dispatch(endMedia());
        }, elapsed) as any;
      }
    }
  };
};

const requestMedia = (url: string): RpcThunk<void> => async (dispatch, getState, context) => {
  const service = getServiceForUrl(url);
  if (!service) {
    // TODO: tell client the service is unsupported
    console.error('Unsupported service for', url);
    return;
  }

  let result;

  try {
    result = await service.resolve(url);
  } catch (e) {
    console.error(`Failed to fetch media URL metadata`);
    console.error(e);
    return;
  }

  console.log('Service result', result);

  const userId = context.client.id;
  const media: IMediaItem = {
    url: result.url,
    title: result.title,
    duration: result.duration,
    imageUrl: result.thumbnails[MediaThumbnailSize.Default],
    ownerId: userId.toString(),
    ownerName: PlatformService.getUserName(userId)
  };

  dispatch(setMedia(media));
  dispatch(updatePlaybackTimer());
};
export const server_requestMedia = rpc(RpcRealm.Server, requestMedia);

const requestPlayPause = (): RpcThunk<void> => async (dispatch, getState, context) => {
  const state = getState();
  const playback = getPlaybackState(state);
  const curTime = getPlaybackTime(state);

  switch (playback) {
    case PlaybackState.Playing:
    case PlaybackState.Paused:
      dispatch(playPauseMedia(curTime));
      dispatch(updatePlaybackTimer());
      break;
  }
};
export const server_requestPlayPause = rpc(RpcRealm.Server, requestPlayPause);

const requestNextMedia = (): RpcThunk<void> => async (dispatch, getState, context) => {
  const state = getState();
  const media = getCurrentMedia(state);

  if (media) {
    dispatch(nextMedia());
    dispatch(updatePlaybackTimer());
  }
};
export const server_requestNextMedia = rpc(RpcRealm.Server, requestNextMedia);
