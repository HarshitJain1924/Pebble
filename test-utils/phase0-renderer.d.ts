declare module "react-test-renderer" {
  export function create(element: any): any;
  export function act(callback: () => void | Promise<void>): Promise<void> | void;
}
