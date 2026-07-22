/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gauge, SkipBack, Pause, Play, SkipForward, VolumeX, Volume2 } from 'lucide-react';
import { VaultMedia } from '../../types/vault';
import VideoProgressBar from './VideoProgressBar';

export interface VideoControlsProps {
  showControls: boolean;
  activeMedia: VaultMedia;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  showSpeedMenu: boolean;
  setShowSpeedMenu: (show: boolean) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  handleVolumeChange: (vol: number) => void;
  handleSeek: (time: number) => void;
  handleSpeedChange: (speed: number) => void;
  handlePrev: () => void;
  handleNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  formatTime: (time: number) => string;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  showControls,
  activeMedia,
  currentTime,
  duration,
  bufferedEnd,
  isPlaying,
  volume,
  isMuted,
  playbackSpeed,
  showSpeedMenu,
  setShowSpeedMenu,
  togglePlay,
  toggleMute,
  handleVolumeChange,
  handleSeek,
  handleSpeedChange,
  handlePrev,
  handleNext,
  hasPrev,
  hasNext,
  formatTime,
}) => {
  return (
    <AnimatePresence>
      {showControls && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="absolute left-4 right-4 bottom-4 z-35 bg-slate-950/65 border border-white/5 p-4 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col gap-3 max-w-3xl mx-auto select-none pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Timeline custom row */}
          <div className="flex flex-col gap-1 w-full">
            <VideoProgressBar
              currentTime={currentTime}
              duration={duration}
              bufferedEnd={bufferedEnd}
              onSeek={handleSeek}
            />
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 font-semibold px-0.5 mt-0.5 select-none pointer-events-none">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Dynamic Controls Row */}
          <div className="flex items-center justify-between gap-4">
            
            {/* Speed Button with popup */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex h-9 items-center gap-1.5 px-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white text-slate-300 text-xs font-mono transition-all cursor-pointer"
              >
                <Gauge className="h-3.5 w-3.5 text-indigo-400" strokeWidth={1.5} />
                <span>{playbackSpeed.toFixed(2)}x</span>
              </button>

              <AnimatePresence>
                {showSpeedMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="absolute bottom-11 left-0 z-50 bg-slate-950 border border-white/5 p-1.5 rounded-2xl shadow-2xl flex flex-col gap-0.5 min-w-[95px]"
                  >
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => handleSpeedChange(speed)}
                        className={`w-full py-1.5 rounded-lg text-left px-3 text-xs font-mono tracking-wider transition-colors cursor-pointer
                          ${playbackSpeed === speed 
                            ? 'bg-indigo-500 text-slate-950 font-bold' 
                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                          }
                        `}
                      >
                        {speed.toFixed(2)}x
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Core Playback Controls (Center) */}
            <div className="flex items-center gap-5">
              {/* Previous Media */}
              <button
                onClick={handlePrev}
                disabled={!hasPrev}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
              >
                <SkipBack className="h-4 w-4" strokeWidth={1.5} />
              </button>

              {/* Primary Play/Pause Center Trigger */}
              <motion.button
                id="btn-player-playpause"
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={togglePlay}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-slate-950 hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer overflow-hidden relative"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isPlaying ? (
                    <motion.div
                      key="pause"
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 45 }}
                      transition={{ duration: 0.12 }}
                    >
                      <Pause className="h-5 w-5 fill-slate-950 stroke-slate-950" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="play"
                      initial={{ scale: 0, rotate: 45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: -45 }}
                      transition={{ duration: 0.12 }}
                      className="translate-x-[1px]"
                    >
                      <Play className="h-5 w-5 fill-slate-950 stroke-slate-950" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              {/* Next Media */}
              <button
                onClick={handleNext}
                disabled={!hasNext}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
              >
                <SkipForward className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Volume Controller (Right side) */}
            <div className="flex items-center gap-2 group max-w-[120px] md:max-w-none">
              <button
                id="btn-player-mute"
                onClick={toggleMute}
                className="text-slate-400 hover:text-white hover:scale-105 transition-all cursor-pointer shrink-0"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4 text-rose-400" strokeWidth={1.5} />
                ) : (
                  <Volume2 className="h-4 w-4 text-indigo-400" strokeWidth={1.5} />
                )}
              </button>
              <input
                id="volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-14 md:w-20 accent-white bg-white/10 h-1 rounded-lg appearance-none cursor-pointer transition-all hover:h-1.5"
              />
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VideoControls;
