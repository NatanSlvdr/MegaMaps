#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include <emscripten.h>
#include <jpeglib.h>

/* A synchronous OPFS source keeps even the compressed original out of WASM RAM. */
EM_JS(int, input_read, (unsigned char *dst, int offset, int count), {
  try { return Module.readInput(offset, HEAPU8.subarray(dst, dst + count)); }
  catch (e) { Module.ioError = String(e); return -1; }
});
struct error_state { struct jpeg_error_mgr base; jmp_buf jump; char message[JMSG_LENGTH_MAX]; };
struct source_state { struct jpeg_source_mgr base; unsigned char buffer[65536]; int offset; };
static struct jpeg_decompress_struct image;
static struct error_state error;
static struct source_state source;
static unsigned char *row;
static int created;
static int cmyk;
static void fail(j_common_ptr c) { (*c->err->format_message)(c, error.message); longjmp(error.jump, 1); }
static void init_source(j_decompress_ptr c) { source.offset = 0; }
static boolean fill(j_decompress_ptr c) {
  int n = input_read(source.buffer, source.offset, sizeof(source.buffer));
  if (n <= 0) { strcpy(error.message, "JPEG data is truncated or unreadable."); longjmp(error.jump, 1); }
  source.offset += n;
  source.base.next_input_byte = source.buffer;
  source.base.bytes_in_buffer = n;
  return TRUE;
}
static void skip(j_decompress_ptr c, long n) {
  if (n <= 0) return;
  while ((size_t)n > source.base.bytes_in_buffer) { n -= source.base.bytes_in_buffer; fill(c); }
  source.base.next_input_byte += n; source.base.bytes_in_buffer -= n;
}
static void term_source(j_decompress_ptr c) {}
EMSCRIPTEN_KEEPALIVE void decoder_close(void) {
  free(row); row = NULL;
  if (created) { jpeg_destroy_decompress(&image); created = 0; }
}
EMSCRIPTEN_KEEPALIVE int decoder_open(void) {
  memset(&image, 0, sizeof(image));
  image.err = jpeg_std_error(&error.base); error.base.error_exit = fail;
  if (setjmp(error.jump)) { decoder_close(); return 0; }
  jpeg_create_decompress(&image); created = 1;
  memset(&source, 0, sizeof(source));
  source.base.init_source = init_source; source.base.fill_input_buffer = fill;
  source.base.skip_input_data = skip; source.base.resync_to_restart = jpeg_resync_to_restart; source.base.term_source = term_source;
  image.src = &source.base;
  jpeg_read_header(&image, TRUE);
  if (image.image_width * (double)image.image_height > 300000000 || image.data_precision != 8) { strcpy(error.message, "JPEG exceeds supported dimensions/precision."); decoder_close(); return 0; }
  cmyk = image.jpeg_color_space == JCS_CMYK || image.jpeg_color_space == JCS_YCCK;
  image.out_color_space = cmyk ? JCS_CMYK : JCS_EXT_RGBA;
  image.mem->max_memory_to_use = 12 * 1024 * 1024;
  jpeg_start_decompress(&image);
  row = malloc(image.output_width * 4);
  if (!row) { strcpy(error.message, "Not enough decoder memory."); decoder_close(); return 0; }
  return image.output_width;
}
EMSCRIPTEN_KEEPALIVE int decoder_height(void) { return image.output_height; }
EMSCRIPTEN_KEEPALIVE unsigned char *decoder_row(void) {
  if (setjmp(error.jump)) return NULL;
  if (!created || image.output_scanline >= image.output_height) return NULL;
  JSAMPROW rows[1] = { row };
  if (jpeg_read_scanlines(&image, rows, 1) != 1) return NULL;
  if (cmyk) {
    /* Adobe JPEG stores inverted CMYK; other CMYK uses conventional ink values. */
    for (unsigned int x = 0; x < image.output_width; x++) {
      unsigned char *p = row + x * 4;
      int k = image.saw_Adobe_marker ? p[3] : 255 - p[3];
      for (int i = 0; i < 3; i++) p[i] = ((image.saw_Adobe_marker ? p[i] : 255 - p[i]) * k + 127) / 255;
      p[3] = 255;
    }
  }
  return row;
}
EMSCRIPTEN_KEEPALIVE int decoder_finish(void) {
  if (setjmp(error.jump)) return 0;
  return jpeg_finish_decompress(&image) ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE char *decoder_error(void) { return error.message; }
