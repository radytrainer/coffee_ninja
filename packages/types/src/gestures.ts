/**
 * Contract between the Python vision service (/ws/gesture) and the kiosk.
 * Coordinates are normalized to 0..1 in *screen* space (after calibration mapping).
 */
/** `eyes_closed`: both eyes held closed (~1 s) — an alternative "back" to the open palm. */
export type GestureName = 'pinch' | 'open_palm' | 'thumbs_up' | 'eyes_closed';

export interface CursorEvent {
  type: 'cursor';
  x: number;
  y: number;
  /** Uncalibrated (camera-space, mirrored) coordinates — used by the calibration screen. */
  rawX: number;
  rawY: number;
  handDetected: boolean;
  pointing: boolean;
  /** True while thumb and index are held together. */
  pinching: boolean;
  /** 0..1 — how close thumb and index are (1 = touching). */
  pinchStrength: number;
  /** ✌️ scroll pose active (clicks are disabled). */
  scrolling?: boolean;
  /** ✋ open palm moving sideways — slideshow swipe (clicks are disabled). */
  swiping?: boolean;
  timestamp: number;
}

export interface GestureEvent {
  type: 'gesture';
  gesture: GestureName;
  confidence: number;
  /** Stable cursor position at the moment the gesture started (screen space). */
  x?: number;
  y?: number;
  timestamp: number;
}

/** ✌️ two-finger scroll / swipe. dx/dy are screen-normalized hand movement since the last event. */
export interface ScrollEvent {
  type: 'scroll';
  phase: 'start' | 'move' | 'end';
  dx: number;
  dy: number;
  x: number;
  y: number;
  timestamp: number;
}

/** ✋ Open palm moved sideways (slideshow). dx: screen-normalized movement since the last event. */
export interface SwipeEvent {
  type: 'swipe';
  phase: 'start' | 'move' | 'end';
  dx: number;
  x: number;
  y: number;
  timestamp: number;
}

export interface HandEvent {
  type: 'hand';
  handDetected: boolean;
  timestamp: number;
}

export interface StatusEvent {
  type: 'status';
  camera: 'starting' | 'running' | 'unavailable' | 'stopped';
  message?: string;
  fps: number;
  calibrated: boolean;
  /** Camera image too dark to see hands (covered camera, lights off). */
  lowLight?: boolean;
  timestamp: number;
}

/** Face state for on-screen feedback (throttled, ~8/s while a face is visible). */
export interface FaceEvent {
  type: 'face';
  faceDetected: boolean;
  /** 0..1 smile strength. */
  smile: number;
  /** 0..1 progress of holding the smile until it counts. */
  smileProgress: number;
  timestamp: number;
}

/** The customer held a smile. `token` is signed by the vision service and redeemable once for the smile discount. */
export interface SmileEvent {
  type: 'smile';
  token: string;
  timestamp: number;
}

export type VisionEvent =
  | CursorEvent
  | GestureEvent
  | ScrollEvent
  | SwipeEvent
  | HandEvent
  | StatusEvent
  | FaceEvent
  | SmileEvent;

export type CursorState = 'NORMAL' | 'HOVER' | 'PINCH' | 'DISABLED' | 'SCROLL' | 'SWIPE';

export type InputMode = 'gesture' | 'mouse';
