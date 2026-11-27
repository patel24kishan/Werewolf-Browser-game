'use client';
/**
 * Scan view: opens the rear camera, decodes QR codes (BarcodeDetector when the
 * browser has it, else jsQR on canvas frames) and hands back a room code only
 * for our own join links (`parseJoinQr`). The scanned URL is never followed.
 * Every camera track is stopped on every exit path.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, ChevronLeft } from '@/ui/components';
import { parseJoinQr } from './parseJoinQr';

type ScanState = 'starting' | 'scanning' | 'denied' | 'unavailable';

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (opts: { formats: string[] }) => DetectorLike;

const SCAN_INTERVAL_MS = 150;
const MAX_FRAME_WIDTH = 480;

export interface ScanStepProps {
  /** Called with a valid, uppercase room code. */
  onCode: (code: string) => void;
  /** Back to the code step (both the chevron and "Type the code instead"). */
  onBack: () => void;
}

/** Full-screen QR scanner. */
export function ScanStep({ onCode, onBack }: ScanStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>('starting');
  const [rejected, setRejected] = useState(false);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        return;
      }
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (e) {
        if (stopped) return;
        const name = e instanceof DOMException ? e.name : '';
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
        return;
      }
      if (stopped) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = media;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = media;
      try {
        await video.play();
      } catch {
        // Autoplay can be refused; frames may still arrive.
      }
      if (stopped) return;
      setState('scanning');

      const Detector = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
      const canvas = document.createElement('canvas');
      const jsQRPromise = detector ? null : import('jsqr').then((m) => m.default);

      const tick = async () => {
        if (stopped) return;
        let text: string | null = null;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            if (detector) {
              const found = await detector.detect(video);
              text = found[0]?.rawValue ?? null;
            } else if (jsQRPromise) {
              const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const jsQR = await jsQRPromise;
                text = jsQR(image.data, image.width, image.height)?.data ?? null;
              }
            }
          }
        } catch {
          // A failed frame is skipped; keep scanning.
        }
        if (stopped) return;
        if (text !== null) {
          const code = parseJoinQr(text, window.location.origin);
          if (code !== null) {
            stop();
            onCodeRef.current(code);
            return;
          }
          setRejected(true);
        }
        timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      };
      void tick();
    }

    void start();
    return stop;
  }, []);

  const failed = state === 'denied' || state === 'unavailable';

  return (
    <div className="scan">
      {failed ? null : <video ref={videoRef} className="scan__video" muted playsInline aria-hidden="true" />}
      <div className="scan__layout">
        <div className="scan__top">
          <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
            <ChevronLeft />
          </button>
        </div>

        {failed ? (
          <div className="scan__denied" role="alert">
            <h1 className="title title--md">Camera not available</h1>
            <p className="lede">
              {state === 'denied'
                ? 'The camera is blocked for this page. Allow camera access in your browser settings to scan, or type the code instead.'
                : "This phone can't open the camera here. Type the code instead."}
            </p>
          </div>
        ) : (
          <>
            <div className="scan__heading">
              <h1 className="title title--md">Scan to join</h1>
              <p className="lede lede--sm">Point at the QR code on the host&apos;s phone.</p>
            </div>
            <div className="scan__frame" aria-hidden="true">
              <div className="scan__corner scan__corner--tl" />
              <div className="scan__corner scan__corner--tr" />
              <div className="scan__corner scan__corner--bl" />
              <div className="scan__corner scan__corner--br" />
              <div className="scan__line" />
            </div>
            <div className="scan__status">
              <p role="status" className={rejected ? 'scan__pill scan__pill--error' : 'scan__pill'}>
                {rejected ? null : <span className="scan__dot" aria-hidden="true" />}
                {rejected ? "That's not a game code" : state === 'starting' ? 'Opening the camera…' : 'Looking for a game code…'}
              </p>
            </div>
          </>
        )}

        <div className="scan__bottom">
          {failed ? null : <p className="caption scan__note">Only game codes are accepted. Other QR codes are ignored.</p>}
          <Button variant="secondary" onClick={onBack}>
            Type the code instead
          </Button>
        </div>
      </div>
    </div>
  );
}
