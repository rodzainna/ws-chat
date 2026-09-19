import { useEffect, useState } from "react";

type Connection<T> = {
  edges: { cursor: string; node: T }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount: number;
};

export function usePagedConnection<T>(
  fetchPage: (after: string | null) => Promise<Connection<T>>,
  pageSize: number,
  refreshKey: unknown,
) {
  const [pages, setPages] = useState<T[][]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAllPages() {
      setLoading(true);
      setError(false);
      try {
        const allPages: T[][] = [];
        let after: string | null = null;
        let total = 0;
        let hasNextPage = true;
        while (hasNextPage) {
          const result = await fetchPage(after);
          total = result.totalCount;
          allPages.push(result.edges.map((edge) => edge.node));
          hasNextPage = result.pageInfo.hasNextPage;
          after = result.pageInfo.endCursor;
        }
        if (cancelled) return;
        setPages(allPages);
        setTotalCount(total);
        setCurrentPage((prev) => Math.min(prev, allPages.length - 1));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAllPages();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return {
    items: pages[currentPage] ?? [],
    currentPage,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
    setCurrentPage,
    loading,
    error,
  };
}
