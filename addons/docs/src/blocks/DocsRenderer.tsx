import React, { ComponentType, ReactElement } from 'react';
import ReactDOM from 'react-dom';
import { AnyFramework, Parameters } from '@storybook/csf';
import { ModuleExports, Story } from '@storybook/store';
import type { DocsRenderFunction } from '@storybook/preview-web';
import { DocsContainer } from './DocsContainer';
import { DocsPage } from './DocsPage';

import { DocsContext, DocsContextProps } from './DocsContext';
import { NoDocs } from './NoDocs';

// FIXME -- make this: DocsRenderFunction<TFramework>
export function renderDocs<TFramework extends AnyFramework>(
  docsContext: DocsContextProps<TFramework>,
  docsParameters: Parameters,
  element: HTMLElement,
  callback: () => void
): void {
  renderDocsAsync(docsContext, docsParameters, element).then(callback);
}

async function renderDocsAsync<TFramework extends AnyFramework>(
  docsContext: DocsContextProps<TFramework>,
  docsParameters: Parameters,
  element: HTMLElement
) {
  console.log(docsParameters);

  // FIXME -- use DocsContainer, make it work for modern
  const SimpleContainer = ({ children }: any) => (
    <DocsContext.Provider value={docsContext}>{children} </DocsContext.Provider>
  );

  const Container: ComponentType<{ context: DocsContextProps<TFramework> }> =
    docsParameters.container ||
    (await docsParameters.getContainer?.()) ||
    (docsContext.type === 'legacy' ? DocsContainer : SimpleContainer);

  const Page: ComponentType = docsParameters.page || (await docsParameters.getPage?.()) || DocsPage;
  console.log(docsParameters.page, Page);

  // Use `title` as a key so that we force a re-render every time we switch components
  const docsElement = (
    <Container key={docsContext.title} context={docsContext}>
      <Page />
    </Container>
  );

  await new Promise<void>((resolve) => {
    ReactDOM.render(docsElement, element, resolve);
  });
}

export function unmountDocs(element: HTMLElement) {
  ReactDOM.unmountComponentAtNode(element);
}
