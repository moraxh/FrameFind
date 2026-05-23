// @ts-nocheck
import * as __fd_glob_12 from "../content/docs/react/mask-detector.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/react/head-pose-detector.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/react/glasses-detector.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/react/gaze-detector.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/react/blink-detector.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/core/mask-detector.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/core/head-pose-detector.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/core/glasses-detector.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/core/gaze-detector.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/core/blink-detector.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/react/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/core/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"core/meta.json": __fd_glob_0, "react/meta.json": __fd_glob_1, }, {"index.mdx": __fd_glob_2, "core/blink-detector.mdx": __fd_glob_3, "core/gaze-detector.mdx": __fd_glob_4, "core/glasses-detector.mdx": __fd_glob_5, "core/head-pose-detector.mdx": __fd_glob_6, "core/mask-detector.mdx": __fd_glob_7, "react/blink-detector.mdx": __fd_glob_8, "react/gaze-detector.mdx": __fd_glob_9, "react/glasses-detector.mdx": __fd_glob_10, "react/head-pose-detector.mdx": __fd_glob_11, "react/mask-detector.mdx": __fd_glob_12, });