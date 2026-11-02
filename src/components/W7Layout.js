import { FlexDirection } from 'yoga-layout';
import { W7Node } from './W7Node.js';

// dir="v"（預設，垂直）| dir="h"（水平）
export class W7Layout extends W7Node {
  constructor(attrs, ctx) {
    super(attrs, ctx);
    this.yoga.setFlexDirection(attrs.dir === 'h' ? FlexDirection.Row : FlexDirection.Column);
  }
}
