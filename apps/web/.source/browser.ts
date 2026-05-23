// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "core/blink-detector.mdx": () => import("../content/docs/core/blink-detector.mdx?collection=docs"), "core/gaze-detector.mdx": () => import("../content/docs/core/gaze-detector.mdx?collection=docs"), "core/glasses-detector.mdx": () => import("../content/docs/core/glasses-detector.mdx?collection=docs"), "core/head-pose-detector.mdx": () => import("../content/docs/core/head-pose-detector.mdx?collection=docs"), "core/mask-detector.mdx": () => import("../content/docs/core/mask-detector.mdx?collection=docs"), "react/blink-detector.mdx": () => import("../content/docs/react/blink-detector.mdx?collection=docs"), "react/gaze-detector.mdx": () => import("../content/docs/react/gaze-detector.mdx?collection=docs"), "react/glasses-detector.mdx": () => import("../content/docs/react/glasses-detector.mdx?collection=docs"), "react/head-pose-detector.mdx": () => import("../content/docs/react/head-pose-detector.mdx?collection=docs"), "react/mask-detector.mdx": () => import("../content/docs/react/mask-detector.mdx?collection=docs"), }),
};
export default browserCollections;