const {
  document,
  cancelAnimationFrame,
  requestAnimationFrame
} = globalThis;

export default class IncrementalText {
  #raf = 0;
  #target = null;
  #lastNode = null;
  constructor(target) {
    this.#target = target;
  }
  show(text, replaceLast) {
    cancelAnimationFrame(this.#raf);
    if(replaceLast)
      this.#target.removeChild(this.#lastNode);
    this.#lastNode = this.#target.appendChild(document.createElement("div"));
    const node = this.#lastNode.appendChild(document.createTextNode(''));
    const chars = [...text];
    let i = 0;
    const show = () => {
      if (i < chars.length) {
        node.data += chars[i++];
        this.#raf = requestAnimationFrame(show);
      }
    };
    this.#raf = requestAnimationFrame(show);
  }
}
