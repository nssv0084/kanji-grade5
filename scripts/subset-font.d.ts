declare module "subset-font" {
  export default function subsetFont(font: Buffer, text: string, options?: { targetFormat?: "truetype" | "woff" | "woff2" | "sfnt" }): Promise<Buffer>;
}
