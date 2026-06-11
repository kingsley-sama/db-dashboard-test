'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ProjectsTable } from '@/components/projects-table';
import { FolderKanban, Clock, CheckCircle, TrendingUp } from 'lucide-react';

export function ProjectsPageClient() {
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
      const response = await fetch('/api/projects');
      const result = await response.json();

      if (response.ok && result.data) {
        const projects = result.data;
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        setStats({
          total: result.pagination?.total ?? projects.length,
          pending: projects.filter((p: any) => !p.project_completion_date).length,
          completed: projects.filter((p: any) => !!p.project_completion_date).length,
          thisWeek: projects.filter((p: any) => new Date(p.created_at) > weekAgo).length
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleProjectsChange = () => {
    fetchStats();
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Projects Management</h1>
        <p className="text-gray-500 mt-1">View, search, create and update projects</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-white hover:shadow-lg transition-all border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Projects</p>
              <p className="text-3xl font-bold mt-1 text-blue-600">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-100">
              <FolderKanban className="w-6 h-6 text-blue-600" />
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

      {/* Projects Table */}
      <div className="min-h-[500px]">
        <ProjectsTable onProjectsChange={handleProjectsChange} />
      </div>
    </div>
  );
}
