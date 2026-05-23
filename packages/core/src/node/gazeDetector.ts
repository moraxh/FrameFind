import {
	applyGazeCalibration,
	DEFAULT_GAZE_DEADZONE,
	DEFAULT_GAZE_MIRROR_X,
	DEFAULT_GAZE_MIRROR_Y,
	DEFAULT_GAZE_PITCH_COMPENSATION,
	DEFAULT_GAZE_YAW_COMPENSATION,
	fitGazeCalibration,
	type GazeCalibration,
	type GazeCalibrationSample,
	gazeRegion,
	type GazeResult,
	LEFT_EYE_BOUNDS,
	LEFT_IRIS_IDX,
	RIGHT_EYE_BOUNDS,
	RIGHT_IRIS_IDX,
} from "@framefind/utils";

export type GazeDetectorNodeOptions = {
	yawCompensation?: number;
	pitchCompensation?: number;
	deadzone?: number;
	mirrorX?: boolean;
	mirrorY?: boolean;
};

type LandmarkPoint = { x: number; y: number; z?: number };

/**
 * Pure-geometry gaze estimator for Node.
 *
 * Pair with a face-landmarks pipeline (e.g. @tensorflow-models/face-landmarks-detection with
 * refineLandmarks: true) so the iris keypoints (indices 468–477) are populated.
 */
export class GazeDetectorNode {
	private yawComp: number;
	private pitchComp: number;
	private deadzone: number;
	private mirrorX: boolean;
	private mirrorY: boolean;

	private calibrationSamples: GazeCalibrationSample[] = [];
	private calibration: GazeCalibration | null = null;

	constructor(opts: GazeDetectorNodeOptions = {}) {
		this.yawComp = opts.yawCompensation ?? DEFAULT_GAZE_YAW_COMPENSATION;
		this.pitchComp = opts.pitchCompensation ?? DEFAULT_GAZE_PITCH_COMPENSATION;
		this.deadzone = opts.deadzone ?? DEFAULT_GAZE_DEADZONE;
		this.mirrorX = opts.mirrorX ?? DEFAULT_GAZE_MIRROR_X;
		this.mirrorY = opts.mirrorY ?? DEFAULT_GAZE_MIRROR_Y;
	}

	/**
	 * Compute gaze from a 478-point landmark array (canonical MediaPipe order, iris included).
	 * `yawDeg` / `pitchDeg` are optional and used to compensate for head orientation.
	 */
	detectFromLandmarks(
		landmarks: LandmarkPoint[],
		yawDeg = 0,
		pitchDeg = 0,
	): GazeResult {
		if (!landmarks || landmarks.length < 478) {
			return {
				x: 0,
				y: 0,
				region: "center",
				rawX: 0,
				rawY: 0,
				screen: { x: 0.5, y: 0.5 },
				faceDetected: false,
			};
		}
		const { rawX, rawY } = computeGaze(landmarks);
		let compX = rawX - yawDeg * this.yawComp;
		let compY = rawY - pitchDeg * this.pitchComp;
		if (this.mirrorX) compX = -compX;
		if (this.mirrorY) compY = -compY;
		let x: number;
		let y: number;
		let screenX: number;
		let screenY: number;
		if (this.calibration) {
			const mapped = applyGazeCalibration(this.calibration, compX, compY);
			screenX = clamp(mapped.x, 0, 1);
			screenY = clamp(mapped.y, 0, 1);
			x = screenX * 2 - 1;
			y = screenY * 2 - 1;
		} else {
			x = clamp(compX, -1, 1);
			y = clamp(compY, -1, 1);
			screenX = (x + 1) / 2;
			screenY = (y + 1) / 2;
		}
		return {
			x,
			y,
			rawX: compX,
			rawY: compY,
			region: gazeRegion(x, y, this.deadzone),
			screen: { x: screenX, y: screenY },
			faceDetected: true,
		};
	}

	pushCalibrationSample(sample: GazeCalibrationSample): void {
		this.calibrationSamples.push(sample);
	}

	calibrate(): GazeCalibration | null {
		const cal = fitGazeCalibration(this.calibrationSamples);
		this.calibration = cal;
		return cal;
	}

	setCalibration(cal: GazeCalibration | null): void {
		this.calibration = cal;
	}

	getCalibration(): GazeCalibration | null {
		return this.calibration;
	}

	isCalibrated(): boolean {
		return this.calibration !== null;
	}

	clearCalibration(): void {
		this.calibrationSamples = [];
		this.calibration = null;
	}
}

function computeGaze(landmarks: LandmarkPoint[]): {
	rawX: number;
	rawY: number;
} {
	const left = irisInEye(
		landmarks,
		LEFT_IRIS_IDX[0],
		LEFT_EYE_BOUNDS.outer,
		LEFT_EYE_BOUNDS.inner,
		LEFT_EYE_BOUNDS.top,
		LEFT_EYE_BOUNDS.bottom,
	);
	const right = irisInEye(
		landmarks,
		RIGHT_IRIS_IDX[0],
		RIGHT_EYE_BOUNDS.inner,
		RIGHT_EYE_BOUNDS.outer,
		RIGHT_EYE_BOUNDS.top,
		RIGHT_EYE_BOUNDS.bottom,
	);
	return {
		rawX: (left.x + right.x) / 2,
		rawY: (left.y + right.y) / 2,
	};
}

function irisInEye(
	lm: LandmarkPoint[],
	irisIdx: number,
	leftBoundIdx: number,
	rightBoundIdx: number,
	topIdx: number,
	bottomIdx: number,
): { x: number; y: number } {
	const iris = lm[irisIdx];
	const xL = lm[leftBoundIdx].x;
	const xR = lm[rightBoundIdx].x;
	const yT = lm[topIdx].y;
	const yB = lm[bottomIdx].y;
	const w = xR - xL;
	const h = yB - yT;
	if (w === 0 || h === 0) return { x: 0, y: 0 };
	const cx = (xL + xR) / 2;
	const cy = (yT + yB) / 2;
	return {
		x: clamp((iris.x - cx) / (w / 2), -1.5, 1.5),
		y: clamp((iris.y - cy) / (h / 2), -1.5, 1.5),
	};
}

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}
