export class Allocator {
  constructor(moduleInstance) {
    this.moduleInstance = moduleInstance;
    this.offsets = []
  }

  alloc(constructor, size) {
    if (size > 0) {
      const offset = this.moduleInstance._malloc(
        size * constructor.BYTES_PER_ELEMENT
      )
      const b = new constructor(
        this.moduleInstance.HEAP8.buffer,
        this.moduleInstance.HEAP8.byteOffset + offset,
        size
      )
      b.offset = offset
      this.offsets.push(offset)
      return b
    } else {
      return new constructor(this.moduleInstance.HEAP8.buffer, 0, 0)
    }
  }

  freeAll() {
    for (let i = 0; i < this.offsets.length; i++) {
      this.moduleInstance._doFree(this.offsets[i])
    }
    this.offsets.length = 0
  }
}