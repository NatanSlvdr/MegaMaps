/* External-memory coefficient storage for progressive JPEG. Adapted from the
 * IJG/libjpeg-turbo jmemnobs interface; see public/codecs/LICENSE-libjpeg.txt. */
#define JPEG_INTERNALS
#include "jinclude.h"
#include "jpeglib.h"
#include "jmemsys.h"
#include <stdint.h>
#include <emscripten.h>
EM_JS(int, scratch_io, (int operation, int id, unsigned char *data, int offset, int count), {
  try {
    if (!Module.scratchIO) return -1;
    return Module.scratchIO(operation, id, HEAPU8.subarray(data, data + count), offset, count);
  } catch (e) { Module.ioError = String(e); return -1; }
});
GLOBAL(void *) jpeg_get_small(j_common_ptr c, size_t n) { return malloc(n); }
GLOBAL(void) jpeg_free_small(j_common_ptr c, void *p, size_t n) { free(p); }
GLOBAL(void *) jpeg_get_large(j_common_ptr c, size_t n) { return malloc(n); }
GLOBAL(void) jpeg_free_large(j_common_ptr c, void *p, size_t n) { free(p); }
GLOBAL(size_t) jpeg_mem_available(j_common_ptr c, size_t min, size_t max, size_t allocated) {
  return allocated < (size_t)c->mem->max_memory_to_use ? c->mem->max_memory_to_use - allocated : 0;
}
static void read_store(j_common_ptr c, backing_store_ptr info, void *data, long offset, long count) {
  if (scratch_io(1, (int)(intptr_t)info->temp_file, data, offset, count) != count) ERREXIT(c, JERR_TFILE_READ);
}
static void write_store(j_common_ptr c, backing_store_ptr info, void *data, long offset, long count) {
  if (scratch_io(2, (int)(intptr_t)info->temp_file, data, offset, count) != count) ERREXIT(c, JERR_TFILE_WRITE);
}
static void close_store(j_common_ptr c, backing_store_ptr info) { scratch_io(3, (int)(intptr_t)info->temp_file, NULL, 0, 0); }
GLOBAL(void) jpeg_open_backing_store(j_common_ptr c, backing_store_ptr info, long count) {
  int id = scratch_io(0, 0, NULL, 0, count);
  if (id < 0) ERREXIT(c, JERR_NO_BACKING_STORE);
  info->temp_file = (FILE *)(intptr_t)id;
  info->read_backing_store = read_store; info->write_backing_store = write_store; info->close_backing_store = close_store;
}
GLOBAL(long) jpeg_mem_init(j_common_ptr c) { return 12 * 1024 * 1024; }
GLOBAL(void) jpeg_mem_term(j_common_ptr c) {}
