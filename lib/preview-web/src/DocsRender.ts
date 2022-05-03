import global from 'global';
import { AnyFramework, StoryId, ViewMode, StoryContextForLoaders } from '@storybook/csf';
import { Story, StoryStore, CSFFile, ModuleExports, IndexEntry } from '@storybook/store';
import { Channel } from '@storybook/addons';
import { DOCS_RENDERED } from '@storybook/core-events';

import { Render, RenderType } from './StoryRender';
import type { DocsContextProps, DocsRenderFunction } from './types';

export class DocsRender<TFramework extends AnyFramework> implements Render<TFramework> {
  public type: RenderType = 'docs';

  public id: StoryId;

  private legacy: boolean;

  public story?: Story<TFramework>;

  public exports?: ModuleExports;

  private preparing = false;

  private canvasElement?: HTMLElement;

  private context?: DocsContextProps<TFramework>;

  public disableKeyListeners = false;

  public teardown: (options: { viewModeChanged?: boolean }) => Promise<void>;

  constructor(
    private channel: Channel,
    private store: StoryStore<TFramework>,
    public entry: IndexEntry
  ) {
    this.id = entry.id;
    this.legacy = entry.type === 'story' || entry.legacy;
  }

  // The two story "renders" are equal and have both loaded the same story
  isEqual(other?: Render<TFramework>) {
    return other && this.id === other.id && this.legacy
      ? this.story && this.story === other.story
      : other.type === 'docs' && this.entry === (other as DocsRender<TFramework>).entry;
  }

  async prepare() {
    this.preparing = true;
    if (this.legacy) {
      this.story = await this.store.loadStory({ storyId: this.id });
    } else {
      this.exports = await this.store.loadDocsFileById(this.id);
    }
    this.preparing = false;
  }

  isPreparing() {
    return this.preparing;
  }

  async docsContext(
    renderStoryToElement: DocsContextProps<TFramework>['renderStoryToElement']
  ): Promise<DocsContextProps<TFramework>> {
    const { id, title, name } = this.entry;
    const csfFile: CSFFile<TFramework> = await this.store.loadCSFFileByStoryId(this.id);

    const base = {
      type: this.legacy ? 'legacy' : ('modern' as DocsContextProps['type']),
      id,
      title,
      name,
      loadStory: (storyId: StoryId) => this.store.loadStory({ storyId }),
      renderStoryToElement,
      getStoryContext: (renderedStory: Story<TFramework>) =>
        ({
          ...this.store.getStoryContext(renderedStory),
          viewMode: 'docs' as ViewMode,
        } as StoryContextForLoaders<TFramework>),

      setMeta: () => {},
      addStory: () => {},
      renderStory: () => {},
    };

    if (this.legacy) {
      const componentStories = () => this.store.componentStoriesFromCSFFile({ csfFile });
      return {
        ...base,

        // NOTE: these two functions are *sync* so cannot access stories from other CSF files
        storyIdByModuleExport: () => {
          throw new Error('`storyIdByModuleExport` not available for legacy docs files.');
        },
        storyById: (storyId: StoryId) => this.store.storyFromCSFFile({ storyId, csfFile }),

        componentStories,
        preloadedStories: componentStories,
      };
    }

    return {
      ...base,
      storyIdByModuleExport: (moduleExport) => this.store.storyIdByModuleExport({ moduleExport }),
      storyById: () => {
        throw new Error('`storyById` not available for modern docs files.');
      },

      componentStories: () => {
        throw new Error('You cannot render all the stories for a component in a docs.mdx file');
      },
      preloadedStories: () => [], // FIXME
    };
  }

  async renderToElement(
    canvasElement: HTMLElement,
    renderStoryToElement: DocsContextProps['renderStoryToElement']
  ) {
    this.canvasElement = canvasElement;
    this.context = await this.docsContext(renderStoryToElement);

    return this.render();
  }

  async render() {
    if (!(this.story || this.exports) || !this.context || !this.canvasElement)
      throw new Error('DocsRender not ready to render');

    const { docs } = this.story?.parameters || this.store.projectAnnotations.parameters;

    if (!docs) {
      throw new Error(
        `Cannot render a story in viewMode=docs if \`@storybook/addon-docs\` is not installed`
      );
    }

    const renderer = await docs.renderer();
    (renderer.renderDocs as DocsRenderFunction<TFramework>)(
      this.context,
      {
        ...docs,
        ...(!this.legacy && { page: this.exports.default }),
      },
      this.canvasElement,
      () => this.channel.emit(DOCS_RENDERED, this.id)
    );
    this.teardown = async ({ viewModeChanged }: { viewModeChanged?: boolean } = {}) => {
      if (!viewModeChanged || !this.canvasElement) return;
      // TODO type
      renderer.unmountDocs(this.canvasElement);
    };
  }

  async rerender() {
    // NOTE: in modern inline render mode, each story is rendered via
    // `preview.renderStoryToElement` which means the story will track
    // its own re-renders. Thus there will be no need to re-render the whole
    // docs page when a single story changes.
    if (!global.FEATURES?.modernInlineRender) await this.render();
  }
}
