import '@testing-library/jest-dom/vitest';

// jsdom ships CSSStyleSheet without the constructable-stylesheet methods that
// @vscode-elements calls at import time.
if (typeof CSSStyleSheet !== 'undefined') {
  const proto = CSSStyleSheet.prototype as unknown as {
    replaceSync?: (text: string) => void;
    replace?: (text: string) => Promise<unknown>;
  };
  proto.replaceSync ??= function (): void {};
  proto.replace ??= function (): Promise<unknown> {
    return Promise.resolve(this);
  };
}

// Likewise, jsdom's ElementInternals lacks the form-associated methods that
// form-associated custom elements call during their first update.
if (typeof ElementInternals !== 'undefined') {
  const proto = ElementInternals.prototype as unknown as {
    setFormValue?: (value: unknown) => void;
    setValidity?: () => void;
  };
  proto.setFormValue ??= function (): void {};
  proto.setValidity ??= function (): void {};
}
