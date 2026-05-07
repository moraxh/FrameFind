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
export declare const DEFAULT_THRESHOLD = 0.35;
export declare const DEFAULT_SMOOTH_N = 8;
export declare const ROI_SIZE = 112;
export declare const MEAN: [number, number, number];
export declare const STD: [number, number, number];
export declare const EYE_REGION_IDX: number[];
export declare function sigmoid(x: number): number;
export declare function smoothAverage(history: number[]): number;
export declare function imageDataToChwFloat32(pixels: Uint8ClampedArray, width: number, height: number): Float32Array;
//# sourceMappingURL=index.d.ts.map