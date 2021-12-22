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
  const [videoClip, setVideoClip] = useState<VideoClip | null>(null);
  const [pendingVideoClip, setPendingVideoClip] = useState<VideoClip | null>(null);
  const [topLayerIndex, setTopLayerIndex] = useState(0);

  const refVideo1 = useRef<HTMLVideoElement>(null);
  const refVideo1Playing = useRef(false);
  const refVideo2 = useRef<HTMLVideoElement>(null);
  const refVideo2Playing = useRef(false);

  const refVideos = useMemo(() => [refVideo1, refVideo2], []);
  const refVideosPlaying = useMemo(() => [refVideo1Playing, refVideo2Playing], []);

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

          console.log('Incoming play request', { videoClip, pendingVideoClip });

          // If there's already a video and the src is different, then set to pending instead
          if (videoClip !== null && videoClip.src !== clip.src) {
            console.log('Setting pending video clip', clip);
            setPendingVideoClip(clip);
          } else {
            if (videoClip === null || !isEqual(videoClip, clip)) {
              console.log('Setting video clip', clip);
              setVideoClip(clip);
            }
          }

          break;
        }
        case 'video_pause':
          if (pendingVideoClip) {
            setPendingVideoClip((video) => (video ? { ...video, state: VideoClipState.Paused } : null));
          } else {
            setVideoClip((video) => (video ? { ...video, state: VideoClipState.Paused } : null));
          }
          break;
        case 'video_stop':
          console.log('Incoming stop request');
          setVideoClip(null);
          setPendingVideoClip(null);
          break;
        case 'video_set_volume':
          console.log('Incoming set volume request', { videoClip, pendingVideoClip });
          if (pendingVideoClip) {
            setPendingVideoClip((video) => (video ? { ...video, volume: message.volume } : null));
          } else {
            setVideoClip((video) => (video ? { ...video, volume: message.volume } : null));
          }
          break;
      }
    },
    [pendingVideoClip, videoClip]
  );

  useCogsMessage(connection, cogsMessageHandler);

  // Manage playing/pausing of the top video
  useEffect(() => {
    const topVideo = refVideos[topLayerIndex].current;
    const topVideoPlaying = refVideosPlaying[topLayerIndex].current;

    if (topVideo) {
      switch (videoClip?.state) {
        case VideoClipState.Playing:
          if (!topVideoPlaying) {
            console.log('Playing top video');
            topVideo.play();
          }
          break;
        case VideoClipState.Paused:
          if (topVideoPlaying) {
            console.log('Pausing top video');
            topVideo.pause();
          }
          break;
      }
    }
  }, [videoClip, topLayerIndex, refVideos, refVideosPlaying]);

  // Manage playing/pausing of the bottom video
  useEffect(() => {
    const bottomVideo = refVideos[1 - topLayerIndex].current;
    const bottomVideoPlaying = refVideosPlaying[1 - topLayerIndex].current;

    if (bottomVideo && pendingVideoClip) {
      switch (pendingVideoClip?.state) {
        case VideoClipState.Playing:
          if (!bottomVideoPlaying) {
            console.log('Playing bottom video');
            bottomVideo.play();
          }
          break;
        case VideoClipState.Paused:
          if (bottomVideoPlaying) {
            console.log('Pausing bottom video');
            bottomVideo.pause();
          }
          break;
      }
    }
  }, [pendingVideoClip, topLayerIndex, refVideos, refVideosPlaying]);

  // Manage playing clip volume
  useEffect(() => {
    [refVideo1, refVideo2].forEach((ref) => {
      if (ref.current) {
        ref.current.volume = videoClip?.volume ?? 1 * globalVolume;
      }
    });
  }, [videoClip, globalVolume]);

  // Manage 'loop' changes whilst playing a video (e.g. by calling play again with loop set to true)
  useEffect(() => {
    const topVideo = refVideos[topLayerIndex].current;
    if (topVideo) {
      topVideo.loop = videoClip?.loop ?? false;
      console.log('Updating loop for top video', topVideo.loop);
    }
  }, [videoClip, topLayerIndex]);

  // Manage the playing state of the top video when videoClip is removed
  useEffect(() => {
    const topVideoPlaying = refVideosPlaying[topLayerIndex];
    if (videoClip === null) {
      topVideoPlaying.current = false;
    }
  }, [videoClip, topLayerIndex, refVideosPlaying]);

  // Manage the playing state of the bottom video when pendingVideoClip is removed
  useEffect(() => {
    // if (pendingVideoClip === null && bottomVideo) {
    //   console.log('Pausing bottom video');
    //   bottomVideo.current?.pause();
    // }

    const bottomVideoPlaying = refVideosPlaying[1 - topLayerIndex];

    if (pendingVideoClip === null) {
      bottomVideoPlaying.current = false;
    }
  }, [pendingVideoClip, refVideosPlaying, topLayerIndex]);

  const notifyVideoPlaying = useCallback(
    (index: number) => {
      console.log('notifyVideoPlaying', index);

      // Update playing state
      refVideosPlaying[index].current = true;

      // Pause video if it shouldn't be playing
      const refVideo = refVideos[index].current;

      if (refVideo) {
        if (
          (topLayerIndex === index && videoClip?.state === VideoClipState.Paused) ||
          (topLayerIndex !== index && pendingVideoClip?.state === VideoClipState.Paused)
        ) {
          console.log('Pausing as started playing but should be paused');
          refVideo.pause();
        }
      }
    },
    [refVideosPlaying, refVideos, topLayerIndex, videoClip, pendingVideoClip?.state]
  );

  const notifyVideoStopped = useCallback(() => {
    console.log('notifyVideoStopped');
    if (!videoClip?.loop) {
      setVideoClip(null);
      onStopped?.();
    }
  }, [videoClip, onStopped]);

  const notifyVideoLoadedData = useCallback(
    (index: number) => {
      console.log('notifyVideoLoadedData', index);
      // If pending, then time to swap
      if (index !== topLayerIndex) {
        console.log('Swapping pending and actual');
        setVideoClip(pendingVideoClip);
        setPendingVideoClip(null);
        setTopLayerIndex((topLayerIndex) => 1 - topLayerIndex);
      }
    },
    [topLayerIndex, pendingVideoClip]
  );

  if (!videoClip) {
    return null;
  }

  const videoStyle: CSSProperties = {
    objectFit: videoClip?.fit ?? 'contain',
    position: 'absolute',
    ...(fullscreen ? { width: '100%', height: '100%' } : {}),
    ...style,
  };

  const topVideoSource = (getCachedAsset && getCachedAsset(videoClip.src)) ?? videoClip.src;
  const bottomVideoSource = pendingVideoClip ? (getCachedAsset && getCachedAsset(pendingVideoClip.src)) ?? pendingVideoClip.src : undefined;

  const videos = (
    <>
      {(topLayerIndex === 0 || pendingVideoClip !== null) && (
        <video
          className={className}
          ref={refVideo1}
          style={{ ...videoStyle, opacity: topLayerIndex === 0 ? 1 : 0 }}
          src={topLayerIndex === 0 ? topVideoSource : bottomVideoSource}
          onEnded={() => notifyVideoStopped()}
          onPlaying={() => notifyVideoPlaying(0)}
          onLoadedData={() => notifyVideoLoadedData(0)}
        />
      )}
      {(topLayerIndex === 1 || pendingVideoClip !== null) && (
        <video
          className={className}
          ref={refVideo2}
          style={{ ...videoStyle, opacity: topLayerIndex === 1 ? 1 : 0 }}
          src={topLayerIndex === 1 ? topVideoSource : bottomVideoSource}
          onEnded={() => notifyVideoStopped()}
          onPlaying={() => notifyVideoPlaying(1)}
          onLoadedData={() => notifyVideoLoadedData(1)}
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
