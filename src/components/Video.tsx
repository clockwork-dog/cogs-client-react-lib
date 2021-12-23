import { assetUrl, CogsClientMessage, CogsConnection, MediaObjectFit } from '@clockworkdog/cogs-client';
import { isEqual } from 'lodash';
import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useCogsMessage from '../hooks/useCogsMessage';
import VideoClipState from '../types/VideoClipState';

export interface VideoClip {
  src: string;
  state: VideoClipState;
  volume: number;
  loop: boolean;
  fit: MediaObjectFit;
}

export default function Video({
  className,
  style,
  connection,
  fullscreen,
  onStopped,
  getCachedAsset,
}: {
  className?: string;
  style?: React.CSSProperties;
  connection: CogsConnection;
  fullscreen?: boolean | { style: React.CSSProperties };
  onStopped?: () => void;
  getCachedAsset?: (assetUrl: string) => string | undefined;
}): JSX.Element | null {
  const [globalVolume, setGlobalVolume] = useState(1);
  const [visibleVideoClip, setVisibleVideoClip] = useState<VideoClip | null>(null);
  const [pendingVideoClip, setPendingVideoClip] = useState<VideoClip | null>(null);
  const [visibleLayerIndex, setVisibleLayerIndex] = useState(0);
  const pendingLayerIndex = 1 - visibleLayerIndex;

  const videoRefs = useRef<[{ playing: boolean; element: null | HTMLVideoElement }, { playing: boolean; element: null | HTMLVideoElement }]>([
    { playing: false, element: null },
    { playing: false, element: null },
  ]);

  // Handler for incoming COGS messages
  const cogsMessageHandler = useCallback(
    (message: CogsClientMessage) => {
      switch (message.type) {
        case 'media_config_update':
          setGlobalVolume(message.globalVolume);
          break;
        case 'video_play': {
          const clip: VideoClip = {
            src: assetUrl(message.file),
            volume: message.volume,
            fit: message.fit,
            loop: message.loop ?? false,
            state: VideoClipState.Playing,
          };

          console.log('Incoming play request', { visibleVideoClip, pendingVideoClip });

          // If there's already a video and the src is different, then set to pending instead
          if (visibleVideoClip !== null && visibleVideoClip.src !== clip.src) {
            console.log('Setting pending video clip', clip);
            setPendingVideoClip(clip);
          } else {
            if (visibleVideoClip === null || !isEqual(visibleVideoClip, clip)) {
              console.log('Setting video clip', clip);
              setVisibleVideoClip(clip);
            }
          }

          break;
        }
        case 'video_pause':
          (pendingVideoClip ? setPendingVideoClip : setVisibleVideoClip)((video) => {
            return video ? { ...video, state: VideoClipState.Paused } : null;
          });
          break;
        case 'video_stop':
          console.log('Incoming stop request');
          setVisibleVideoClip(null);
          setPendingVideoClip(null);
          break;
        case 'video_set_volume':
          console.log('Incoming set volume request', { videoClip: visibleVideoClip, pendingVideoClip });
          (pendingVideoClip ? setPendingVideoClip : setVisibleVideoClip)((video) => {
            return video ? { ...video, volume: message.volume } : null;
          });
          break;
      }
    },
    [pendingVideoClip, visibleVideoClip]
  );

  useCogsMessage(connection, cogsMessageHandler);

  // Manage playing/pausing of the visible video
  useEffect(() => {
    const visibleVideo = videoRefs.current[visibleLayerIndex].element;
    const visibleVideoPlaying = videoRefs.current[visibleLayerIndex].playing;

    if (visibleVideo) {
      switch (visibleVideoClip?.state) {
        case VideoClipState.Playing:
          if (!visibleVideoPlaying) {
            console.log('Playing visible video');
            visibleVideo.play();
          }
          break;
        case VideoClipState.Paused:
          if (visibleVideoPlaying) {
            console.log('Pausing visible video');
            visibleVideo.pause();
          }
          break;
      }
    }
  }, [visibleVideoClip, visibleLayerIndex]);

  // Manage playing/pausing of the pending video
  useEffect(() => {
    const pendingVideo = videoRefs.current[pendingLayerIndex].element;
    const pendingVideoPlaying = videoRefs.current[pendingLayerIndex].playing;

    if (pendingVideo && pendingVideoClip) {
      switch (pendingVideoClip?.state) {
        case VideoClipState.Playing:
          if (!pendingVideoPlaying) {
            console.log('Playing pending video');
            pendingVideo.play();
          }
          break;
        case VideoClipState.Paused:
          if (pendingVideoPlaying) {
            console.log('Pausing pending video');
            pendingVideo.pause();
          }
          break;
      }
    }
  }, [pendingLayerIndex, pendingVideoClip, visibleLayerIndex]);

  // Manage playing clip volume for visible video
  useEffect(() => {
    const visibleVideo = videoRefs.current[visibleLayerIndex].element;

    if (visibleVideo) {
      visibleVideo.volume = (visibleVideoClip?.volume ?? 1) * globalVolume;
    }
  }, [visibleVideoClip?.volume, globalVolume, visibleLayerIndex]);

  // Manage playing clip volume for pending video
  useEffect(() => {
    const pendingVideo = videoRefs.current[pendingLayerIndex].element;

    if (pendingVideo) {
      pendingVideo.volume = (pendingVideoClip?.volume ?? 1) * globalVolume;
    }
  }, [pendingVideoClip?.volume, globalVolume, pendingLayerIndex]);

  // Manage 'loop' changes for visible video (e.g. by calling play again with loop set to true)
  useEffect(() => {
    const visibleVideo = videoRefs.current[visibleLayerIndex].element;

    if (visibleVideo) {
      visibleVideo.loop = visibleVideoClip?.loop ?? false;
      console.log('Updating loop for visible video', visibleVideo.loop);
    }
  }, [visibleVideoClip?.loop, visibleLayerIndex, videoRefs]);

  // Manage 'loop' changes for pending video (e.g. by calling play again with loop set to true)
  useEffect(() => {
    const pendingVideo = videoRefs.current[pendingLayerIndex].element;

    if (pendingVideo) {
      pendingVideo.loop = pendingVideoClip?.loop ?? false;
      console.log('Updating loop for visible video', pendingVideo.loop);
    }
  }, [pendingVideoClip?.loop, pendingLayerIndex]);

  // Manage the playing state of the visible video when videoClip is removed
  useEffect(() => {
    const visibleVideoPlaying = videoRefs.current[visibleLayerIndex];
    if (visibleVideoClip === null) {
      visibleVideoPlaying.playing = false;
    }
  }, [visibleVideoClip, visibleLayerIndex]);

  // Manage the playing state of the bottom video when pendingVideoClip is removed
  useEffect(() => {
    const pendingVideoPlaying = videoRefs.current[pendingLayerIndex];

    if (pendingVideoClip === null) {
      pendingVideoPlaying.playing = false;
    }
  }, [pendingVideoClip, pendingLayerIndex]);

  const onVideoPlaying = useCallback(
    (index: number) => {
      console.log('notifyVideoPlaying', index);

      // Update playing state
      videoRefs.current[index].playing = true;

      // Pause video if it shouldn't be playing
      const videoElement = videoRefs.current[index].element;

      if (videoElement) {
        if (
          (visibleLayerIndex === index && visibleVideoClip?.state === VideoClipState.Paused) ||
          (visibleLayerIndex !== index && pendingVideoClip?.state === VideoClipState.Paused)
        ) {
          console.log('Pausing as started playing but should be paused');
          videoElement.pause();
        }
      }

      // Swap the pending into visible
      if (index !== visibleLayerIndex) {
        console.log('Swapping pending and actual');
        setVisibleVideoClip(pendingVideoClip);
        setPendingVideoClip(null);
        setVisibleLayerIndex(pendingLayerIndex);
      }
    },
    [visibleLayerIndex, visibleVideoClip, pendingVideoClip, pendingLayerIndex]
  );

  const onVideoPause = useCallback((index: number) => {
    videoRefs.current[index].playing = false;
  }, []);

  const onVideoEnded = useCallback(
    (index: number) => {
      console.log('notifyVideoStopped');
      if (index === visibleLayerIndex && !visibleVideoClip?.loop) {
        if (pendingVideoClip === null) {
          setVisibleVideoClip(null);
        }
        onStopped?.();
      }
    },
    [visibleLayerIndex, visibleVideoClip?.loop, pendingVideoClip, onStopped]
  );

  const videoStyle = useMemo(
    (): CSSProperties => ({
      objectFit: visibleVideoClip?.fit ?? 'contain',
      position: 'absolute', // TODO: Try to leave visible video as not absolute and render the pending one off screen
      ...(fullscreen ? { width: '100%', height: '100%' } : {}),
      ...style,
    }),
    [visibleVideoClip?.fit, fullscreen, style]
  );

  // TODO: Test on Pi if performance improvement to have the video elements always in place
  if (!visibleVideoClip) {
    return null;
  }

  const visibleVideoSource = getCachedAsset?.(visibleVideoClip.src) ?? visibleVideoClip.src;
  const pendingVideoSource = pendingVideoClip ? getCachedAsset?.(pendingVideoClip.src) ?? pendingVideoClip.src : undefined;

  const videos = (
    <>
      {(visibleLayerIndex === 0 || pendingVideoClip !== null) && (
        <video
          key="video-0"
          className={className}
          ref={(element) => {
            videoRefs.current[0].element = element;
          }}
          style={{ ...videoStyle, zIndex: visibleLayerIndex === 0 ? 100 : -100 }}
          src={visibleLayerIndex === 0 ? visibleVideoSource : pendingVideoSource}
          onEnded={() => onVideoEnded(0)}
          onPlaying={() => onVideoPlaying(0)}
          onPause={() => onVideoPause(0)}
        />
      )}
      {(visibleLayerIndex === 1 || pendingVideoClip !== null) && (
        <video
          key="video-1"
          className={className}
          ref={(element) => {
            videoRefs.current[1].element = element;
          }}
          style={{ ...videoStyle, zIndex: visibleLayerIndex === 1 ? 100 : -100 }}
          src={visibleLayerIndex === 1 ? visibleVideoSource : pendingVideoSource}
          onEnded={() => onVideoEnded(1)}
          onPlaying={() => onVideoPlaying(1)}
          onPause={() => onVideoPause(1)}
        />
      )}
    </>
  );

  const fullscreenCustomStyle = typeof fullscreen === 'object' ? fullscreen.style : undefined;
  return fullscreen ? (
    <div style={{ position: 'absolute', zIndex: 1, top: 0, left: 0, width: '100vw', height: '100vh', ...fullscreenCustomStyle }}>{videos}</div>
  ) : (
    videos
  );
}
