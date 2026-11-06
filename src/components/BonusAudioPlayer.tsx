"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import styles from "./FullFaceBonusGuide.module.css";

// Volume inicial de 20% em todo player de áudio do guia (inclusive os
// próximos passos). A pessoa continua ajustando pelo controle do player.
const INITIAL_VOLUME = 0.2;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// iOS (iPhone/iPad — todo navegador lá usa o motor WebKit do sistema, não
// só o Safari) ignora HTMLMediaElement.volume: o volume real é só pelos
// botões físicos do aparelho, e isso não é contornável por código. Por
// isso o botão de mudo/volume nem aparece lá — mostrar um controle que
// parece funcionar mas não faz nada (ou, pior, muta sem dar pra
// desmutar de volta) seria pior do que não ter controle nenhum.
function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Player compacto próprio (play/pause, progresso, tempo e volume),
// substituindo o <audio controls> nativo: o nativo não dá pra deixar do
// tamanho pedido (compacto, ~320x32px) de forma confiável entre
// navegadores, nem dá pra mudar o comportamento do botão de volume no
// celular (nativamente ele muta com um toque, sem barra pra reajustar —
// bug relatado). Aqui tocar no ícone de volume abre uma barra deslizante
// em vez de mutar; no iPhone/iPad o controle de volume nem é mostrado
// (ver detectIOS acima).
export function BonusAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(INITIAL_VOLUME);
  const [showVolume, setShowVolume] = useState(false);
  // Começa false em toda renderização (servidor e primeira renderização do
  // cliente, antes da hidratação) de propósito, pra nunca dar mismatch de
  // hidratação — o valor real (se é iOS ou não) só é lido depois, dentro
  // do useEffect abaixo, que só roda no navegador.
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(detectIOS());
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.volume = volume;
    } catch {
      // iOS ignora atribuição de volume — tratado via isIOS (o controle
      // nem chega a aparecer lá, ver render abaixo).
    }
  }, [volume]);

  useEffect(() => {
    if (!showVolume) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setShowVolume(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showVolume]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  function onSeek(e: ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    const t = Number(e.target.value);
    if (el) el.currentTime = t;
    setCurrentTime(t);
  }

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        preload="none"
        src={src}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        type="button"
        className={styles.playerBtn}
        onClick={togglePlay}
        aria-label={isPlaying ? "Pausar" : "Tocar"}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <input
        type="range"
        className={styles.playerProgress}
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={onSeek}
        aria-label="Progresso do áudio"
      />
      <span className={styles.playerTime}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      {!isIOS && (
        <div className={styles.volumeWrap} ref={wrapRef}>
          <button
            type="button"
            className={styles.playerBtn}
            onClick={() => setShowVolume((v) => !v)}
            aria-label="Volume"
          >
            <VolumeIcon size={14} />
          </button>
          {showVolume && (
            <div className={styles.volumePopover}>
              <input
                type="range"
                className={styles.volumeRange}
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
