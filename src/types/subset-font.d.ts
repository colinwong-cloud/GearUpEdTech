declare module "subset-font" {
  function subsetFont(
    font: Uint8Array | Buffer,
    text: string,
    options?: { targetFormat?: string }
  ): Promise<Uint8Array>;
  export default subsetFont;
}
