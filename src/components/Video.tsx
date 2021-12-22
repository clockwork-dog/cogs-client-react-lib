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

  const video1Ref = useRef<HTMLVideoElement>(null);
  const video1PlayingRef = useRef(false);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const video2PlayingRef = useRef(false);

  const videoRefs = useMemo(() => [video1Ref, video2Ref], []);
  const videoPlayingRefs = useMemo(() => [video1PlayingRef, video2PlayingRef], []);

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
    const topVideo = videoRefs[topLayerIndex].current;
    const topVideoPlayingRef = videoPlayingRefs[topLayerIndex];

    if (topVideo) {
      switch (videoClip?.state) {
        case VideoClipState.Playing:
          if (!topVideoPlayingRef.current) {
            console.log('Playing top video');
            topVideo.play();
          }
          break;
        case VideoClipState.Paused:
          if (topVideoPlayingRef.current) {
            console.log('Pausing top video');
            topVideo.pause();
          }
          break;
      }
    }
  }, [videoClip, topLayerIndex, videoRefs, videoPlayingRefs]);

  // Manage playing/pausing of the bottom video
  useEffect(() => {
    const bottomVideo = videoRefs[1 - topLayerIndex].current;
    const bottomVideoPlayingRef = videoPlayingRefs[1 - topLayerIndex];

    if (bottomVideo && pendingVideoClip) {
      switch (pendingVideoClip?.state) {
        case VideoClipState.Playing:
          if (!bottomVideoPlayingRef.current) {
            console.log('Playing bottom video');
            bottomVideo.play();
          }
          break;
        case VideoClipState.Paused:
          if (bottomVideoPlayingRef.current) {
            console.log('Pausing bottom video');
            bottomVideo.pause();
          }
          break;
      }
    }
  }, [pendingVideoClip, topLayerIndex, videoRefs, videoPlayingRefs]);

  // Manage playing clip volume
  useEffect(() => {
    [video1Ref, video2Ref].forEach((ref) => {
      if (ref.current) {
        ref.current.volume = videoClip?.volume ?? 1 * globalVolume;
      }
    });
  }, [videoClip, globalVolume]);

  // Manage 'loop' changes whilst playing a video (e.g. by calling play again with loop set to true)
  useEffect(() => {
    const topVideo = videoRefs[topLayerIndex].current;
    if (topVideo) {
      topVideo.loop = videoClip?.loop ?? false;
      console.log('Updating loop for top video', topVideo.loop);
    }
  }, [videoClip, topLayerIndex, videoRefs]);

  // Manage the playing state of the top video when videoClip is removed
  useEffect(() => {
    const topVideoPlaying = videoPlayingRefs[topLayerIndex];
    if (videoClip === null) {
      topVideoPlaying.current = false;
    }
  }, [videoClip, topLayerIndex, videoPlayingRefs]);

  // Manage the playing state of the bottom video when pendingVideoClip is removed
  useEffect(() => {
    const bottomVideoPlaying = videoPlayingRefs[1 - topLayerIndex];

    if (pendingVideoClip === null) {
      bottomVideoPlaying.current = false;
    }
  }, [pendingVideoClip, videoPlayingRefs, topLayerIndex]);

  const onVideoPlaying = useCallback(
    (index: number) => {
      console.log('notifyVideoPlaying', index);

      // Update playing state
      videoPlayingRefs[index].current = true;

      // Pause video if it shouldn't be playing
      const refVideo = videoRefs[index].current;

      if (refVideo) {
        if (
          (topLayerIndex === index && videoClip?.state === VideoClipState.Paused) ||
          (topLayerIndex !== index && pendingVideoClip?.state === VideoClipState.Paused)
        ) {
          console.log('Pausing as started playing but should be paused');
          refVideo.pause();
        }
      }

      if (index !== topLayerIndex) {
        console.log('Swapping pending and actual');
        setVideoClip(pendingVideoClip);
        setPendingVideoClip(null);
        setTopLayerIndex((topLayerIndex) => 1 - topLayerIndex);
      }
    },
    [videoPlayingRefs, videoRefs, topLayerIndex, videoClip, pendingVideoClip]
  );

  const onVideoPause = useCallback(
    (index: number) => {
      videoPlayingRefs[index].current = false;
    },
    [videoPlayingRefs]
  );

  const onVideoEnded = useCallback(() => {
    console.log('notifyVideoStopped');
    if (!videoClip?.loop) {
      if (pendingVideoClip === null) {
        setVideoClip(null);
      }
      onStopped?.();
    }
  }, [videoClip, onStopped, pendingVideoClip]);

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
          ref={video1Ref}
          style={{ ...videoStyle, zIndex: topLayerIndex === 0 ? 100 : -100 }}
          src={topLayerIndex === 0 ? topVideoSource : bottomVideoSource}
          onEnded={() => onVideoEnded()}
          onPlaying={() => onVideoPlaying(0)}
          onPause={() => onVideoPause(0)}
        />
      )}
      {(topLayerIndex === 1 || pendingVideoClip !== null) && (
        <video
          className={className}
          ref={video2Ref}
          style={{ ...videoStyle, zIndex: topLayerIndex === 1 ? 100 : -100 }}
          src={topLayerIndex === 1 ? topVideoSource : bottomVideoSource}
          onEnded={() => onVideoEnded()}
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
