'use client';

import { useCallback, useState } from 'react';
import { OrdersTable } from '@/components/orders-table';
import { StatusStatTiles } from '@/components/status-stat-tiles';
import { ProjectIntakeSection } from '@/components/project-intake-section';

export default function OrdersPage() {
  // "" = All Orders. Shared between the tiles and the table's status dropdown.
  const [status, setStatus] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  // Mirrors the table's search and column filters so the tiles count the same
  // rows the table is showing.
  const [activeFilters, setActiveFilters] = useState({ search: '', columnFilters: '' });

  const handleOrdersChange = () => {
    setRefreshKey((key) => key + 1);
  };

  const handleActiveFiltersChange = useCallback(
    (filters: { search: string; columnFilters: string }) => {
      setActiveFilters((prev) =>
        prev.search === filters.search && prev.columnFilters === filters.columnFilters
          ? prev
          : filters
      );
    },
    []
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders Management</h1>
          <p className="text-gray-500 mt-1">View, search, create and update orders</p>
        </div>

        {/* Project Intake — the questionnaire handover that produces the orders
            below. Collapsed to a header control; the queue opens over the page.
            Starting intake refreshes the tiles, since the automation creates
            the project's orders. */}
        <ProjectIntakeSection onIntakeStarted={handleOrdersChange} />
      </div>

      {/* Status Tiles — click to filter the table below */}
      <StatusStatTiles
        apiPath="/api/orders"
        value={status}
        onChange={setStatus}
        refreshKey={refreshKey}
        search={activeFilters.search}
        columnFilters={activeFilters.columnFilters}
      />

      {/* Orders Table */}
      <div className="min-h-[500px]">
        <OrdersTable
          onOrdersChange={handleOrdersChange}
          statusFilter={status}
          onStatusFilterChange={setStatus}
          onActiveFiltersChange={handleActiveFiltersChange}
        />
      </div>
    </div>
  );
}
