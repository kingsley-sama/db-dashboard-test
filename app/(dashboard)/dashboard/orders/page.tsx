'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { OrdersTable } from '@/components/orders-table';
import { Package, Clock, CheckCircle, TrendingUp } from 'lucide-react';

export default function OrdersPage() {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
    thisWeek: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/orders');
      const result = await response.json();

      if (response.ok && result.data) {
        const orders = result.data;
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        setStats({
          total: orders.length,
          pending: orders.filter((o: any) => !o.project_completion_date).length,
          completed: orders.filter((o: any) => !!o.project_completion_date).length,
          thisWeek: orders.filter((o: any) => new Date(o.created_at) > weekAgo).length
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleOrdersChange = () => {
    fetchStats();
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Orders Management</h1>
        <p className="text-gray-500 mt-1">View, search, create and update orders</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-white hover:shadow-lg transition-all border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Orders</p>
              <p className="text-3xl font-bold mt-1 text-blue-600">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-100">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white hover:shadow-lg transition-all border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <p className="text-3xl font-bold mt-1 text-amber-600">{stats.pending}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-100">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white hover:shadow-lg transition-all border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-3xl font-bold mt-1 text-emerald-600">{stats.completed}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-100">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white hover:shadow-lg transition-all border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">This Week</p>
              <p className="text-3xl font-bold mt-1 text-purple-600">{stats.thisWeek}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-100">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Orders Table */}
      <div className="min-h-[500px]">
        <OrdersTable onOrdersChange={handleOrdersChange} />
      </div>
    </div>
  );
}
