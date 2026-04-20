import pageStatus from './pageStatus.json';

export const PAGE_REGISTRY = pageStatus;

export const PAGE_STATUS_BY_PATH = Object.fromEntries(
    PAGE_REGISTRY.map((page) => [page.path, page])
);

export const PAGE_STATUS_BY_KEY = Object.fromEntries(
    PAGE_REGISTRY.map((page) => [page.key, page])
);
