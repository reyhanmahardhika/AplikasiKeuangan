declare module "pdf-parse" {
  const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number; info?: unknown; metadata?: unknown }>;
  export default pdfParse;
}
