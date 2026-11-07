import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAotdArticle } from '../assets/js/views/home.js';

test('Article of the Day prefers the featured article when it has its own image', async () => {
  const ctx = { api: {
    async featured() { return { article: { title: 'Featured', extract: 'Lead', url: 'https://en.wikipedia.org/wiki/Featured', thumb: { src: 'https://thumb.wikimedia.org/featured.jpg' }, description: 'Featured page' }, mostread: [] }; },
    async mostRead() { throw new Error('must not be needed'); },
    async pageImage() { throw new Error('must not be needed'); },
    async summary() { throw new Error('must not be needed'); },
  } };
  const result = await resolveAotdArticle(ctx, 'en');
  assert.equal(result.title, 'Featured');
  assert.equal(result.thumb.src, 'https://thumb.wikimedia.org/featured.jpg');
});

test('Article of the Day resolves the article lead image through PageImages', async () => {
  let imageLookups = 0;
  const ctx = { api: {
    async featured() { return { article: { title: 'Ashoka', extract: 'Mauryan emperor', url: 'https://en.wikipedia.org/wiki/Ashoka' }, mostread: [] }; },
    async mostRead() { return []; },
    async pageImage(_lang, title) { imageLookups += 1; assert.equal(title, 'Ashoka'); return { src: 'https://thumb.wikimedia.org/ashoka.jpg', width: 1200, height: 700 }; },
    async summary() { return null; },
  } };
  const result = await resolveAotdArticle(ctx, 'en');
  assert.equal(imageLookups, 1);
  assert.equal(result.thumb.src, 'https://thumb.wikimedia.org/ashoka.jpg');
});

test('Article of the Day skips featured pages without images and selects an illustrated article', async () => {
  const tried = [];
  const ctx = { api: {
    async featured() {
      return {
        article: { title: 'Text only', extract: 'No image', url: 'https://en.wikipedia.org/wiki/Text_only' },
        mostread: [{ title: 'Illustrated', extract: 'Has a photo', url: 'https://en.wikipedia.org/wiki/Illustrated', thumb: { src: 'https://thumb.wikimedia.org/illustrated.jpg' } }],
      };
    },
    async mostRead() { return []; },
    async pageImage(_lang, title) { tried.push(title); return null; },
    async summary() { return null; },
  } };
  const result = await resolveAotdArticle(ctx, 'en');
  assert.deepEqual(tried, ['Text only']);
  assert.equal(result.title, 'Illustrated');
  assert.match(result.thumb.src, /illustrated\.jpg$/);
});

test('Article of the Day never pairs an unrelated picture-of-the-day with a text-only article', async () => {
  const ctx = { api: {
    async featured() { return { article: { title: 'Text only', extract: 'No photo' }, mostread: [], image: { title: 'Unrelated photograph', thumb: { src: 'https://thumb.wikimedia.org/unrelated.jpg' } } }; },
    async mostRead() { return []; },
    async pageImage() { return null; },
    async summary() { return null; },
  } };
  assert.equal(await resolveAotdArticle(ctx, 'en'), null);
});
