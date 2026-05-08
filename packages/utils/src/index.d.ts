export type DetectionResult = {
    glasses: boolean;
    probability: number;
    faceDetected: boolean;
};
export type DetectorConfig = {
    modelUrl: string;
    threshold?: number;
    smoothingWindow?: number;
};
export type HeadPoseLandmark = { x: number; y: number; z: number };
export type HeadPoseResult = {
    yaw: number;
    pitch: number;
    roll: number;
    faceDetected: boolean;
    landmarks?: HeadPoseLandmark[];
};
export declare const DEFAULT_THRESHOLD = 0.35;
export declare const DEFAULT_SMOOTH_N = 8;
export declare const DEFAULT_POSE_ALPHA = 0.15;
export declare const ROI_SIZE = 112;
export declare const MEAN: [number, number, number];
export declare const STD: [number, number, number];
export declare const EYE_REGION_IDX: number[];
export declare function sigmoid(x: number): number;
export declare function smoothAverage(history: number[]): number;
export declare function imageDataToChwFloat32(pixels: Uint8ClampedArray, width: number, height: number): Float32Array;
export type OneEuroOptions = {
    minCutoff?: number;
    beta?: number;
    dCutoff?: number;
};
export declare const DEFAULT_ONE_EURO: Required<OneEuroOptions>;
export declare function angleDelta(target: number, current: number): number;
export declare class OneEuroFilter {
    constructor(opts?: OneEuroOptions, wrap?: boolean);
    reset(): void;
    filter(x: number, tSeconds: number): number;
}
//# sourceMappingURL=index.d.ts.map