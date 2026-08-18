// Metro resolves media imports to an asset module id (a number). Expo ships no
// declaration for audio, so `import bgm from "./x.mp3"` is a type error without
// this. Declaring it lets the asset be a normal ES import rather than a
// `require()`, which keeps the no-require-imports lint rule intact.
declare module "*.mp3" {
  const asset: number;
  export default asset;
}
