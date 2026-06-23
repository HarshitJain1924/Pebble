import React, { useMemo } from "react";

import { PopupBody } from "../components/popup-body";
import type {
  IPopupRenderContext,
  TPopupRenderer,
} from "../typings/motion-tabs";

function usePopupRenderer<T extends TPopupRenderer>(renderPopupBody?: T) {
  return useMemo(
    () =>
      renderPopupBody ??
      ((context: IPopupRenderContext) => (
        <PopupBody
          colors={context.colors}
          route={context.route}
          view={context.view}
        />
      )),
    [renderPopupBody],
  );
}

export { usePopupRenderer };

