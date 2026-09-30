import type { FC, FunctionComponent } from "react";

export type Route<RouteName extends string = string, Params extends object | undefined = object | undefined> = {
  key: string;
  name: RouteName;
  params?: Params;
  path?: string;
};

type TMenuView = "default" | string;
type TActiveView = string;

interface IPalette {
  accent: string;
  border: string;
  foreground: string;
  hover: string;
  input: string;
  muted: string;
  surface: string;
}

interface IPopupRenderContext {
  colors: IPalette;
  route: Route<string>;
  view: string;
}

type TPopupRenderer = FC<IPopupRenderContext> &
  FunctionComponent<IPopupRenderContext>;

interface ISize {
  h: number;
  w: number;
}

interface ISizeMap {
  [view: string]: ISize | undefined;
}

export type {
  IPalette,
  IPopupRenderContext,
  ISizeMap,
  TActiveView,
  TMenuView,
  TPopupRenderer,
};

