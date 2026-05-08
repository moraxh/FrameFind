export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

export function getInstallCommand(pm: PackageManager, packages = "@framefind/core"): string {
  switch (pm) {
    case "pnpm":
      return `pnpm add ${packages}`;
    case "yarn":
      return `yarn add ${packages}`;
    case "bun":
      return `bun add ${packages}`;
    default:
      return `npm install ${packages}`;
  }
}
