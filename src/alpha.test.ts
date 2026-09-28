/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { ConfigReader, JsonObject } from '@backstage/config';
import { readIconLoader, resolveIconPackUrl } from './alpha';

function iconPackConfigFor(iconPack: JsonObject) {
  return new ConfigReader({ iconPack }).getConfig('iconPack');
}

describe('readIconLoader', () => {
  it('builds a sync icon loader for inline icons', () => {
    const icons = {
      prefix: 'custom',
      icons: { 'my-icon': { body: '<path d="M0 0" />' } },
    };

    const loader = readIconLoader(
      iconPackConfigFor({ name: 'custom', icons }),
    );

    expect(loader).toEqual({ name: 'custom', icons });
  });

  it('throws when an entry specifies neither icons nor package', () => {
    expect(() =>
      readIconLoader(iconPackConfigFor({ name: 'custom' })),
    ).toThrow(
      'techdocs.addons.mermaid.iconPacks entry "custom" must specify either "icons" or "package"',
    );
  });

  describe('package-based icon loader', () => {
    const icons = { prefix: 'logos', icons: {} };
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(icons),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('builds an async loader that fetches a bare package from unpkg', async () => {
      const loader = readIconLoader(
        iconPackConfigFor({ name: 'logos', package: '@iconify-json/logos' }),
      );

      expect(loader.name).toBe('logos');
      expect('loader' in loader).toBe(true);

      const result = await (
        loader as { loader: () => Promise<unknown> }
      ).loader();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://unpkg.com/@iconify-json/logos/icons.json',
      );
      expect(result).toEqual(icons);
    });

    it('fetches a full custom URL as-is', async () => {
      const loader = readIconLoader(
        iconPackConfigFor({
          name: 'custom',
          package: 'https://example.com/icons/custom.json',
        }),
      ) as { loader: () => Promise<unknown> };

      await loader.loader();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/icons/custom.json',
      );
    });

    it('throws when the fetch response is not ok', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      });

      const loader = readIconLoader(
        iconPackConfigFor({ name: 'logos', package: '@iconify-json/logos' }),
      ) as { loader: () => Promise<unknown> };

      await expect(loader.loader()).rejects.toThrow(
        'Failed to load icon pack "logos" from https://unpkg.com/@iconify-json/logos/icons.json: 404 Not Found',
      );
    });
  });
});

describe('resolveIconPackUrl', () => {
  it('passes full http(s) URLs through unchanged', () => {
    expect(resolveIconPackUrl('http://example.com/icons.json')).toBe(
      'http://example.com/icons.json',
    );
    expect(resolveIconPackUrl('https://example.com/icons.json')).toBe(
      'https://example.com/icons.json',
    );
  });

  it('appends icons.json for a bare scoped package', () => {
    expect(resolveIconPackUrl('@iconify-json/logos')).toBe(
      'https://unpkg.com/@iconify-json/logos/icons.json',
    );
  });

  it('appends icons.json for a bare unscoped package', () => {
    expect(resolveIconPackUrl('my-icon-pack')).toBe(
      'https://unpkg.com/my-icon-pack/icons.json',
    );
  });

  it('preserves an explicit subpath on a scoped package', () => {
    expect(resolveIconPackUrl('@iconify-json/logos/icons.json')).toBe(
      'https://unpkg.com/@iconify-json/logos/icons.json',
    );
  });

  it('preserves an explicit subpath on an unscoped package', () => {
    expect(resolveIconPackUrl('my-icon-pack/custom.json')).toBe(
      'https://unpkg.com/my-icon-pack/custom.json',
    );
  });
});
