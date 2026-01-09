
declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      src?: string;
      poster?: string;
      alt?: string;
      'shadow-intensity'?: string;
      'camera-controls'?: boolean;
      'auto-rotate'?: boolean;
      ar?: boolean;
      'ios-src'?: string;
    }, HTMLElement>;
  }
}
