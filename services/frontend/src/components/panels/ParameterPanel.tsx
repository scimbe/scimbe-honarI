import React, { useState, useEffect } from 'react';
import { Search, Filter, Clock, Database, Activity, Workflow } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

interface ActivityParameter {
  value: any;
  type: 'string' | 'number' | 'object' | 'array' | 'boolean';
  timestamp: number;
  activityName: string;
  workflowId: string;
  sessionId: string;
  metadata: {
    source: 'activity_output' | 'user_input' | 'system_generated';
    validation?: {
      required: boolean;
      type: string;
      min?: number;
      max?: number;
      pattern?: string;
    };
  };
  ttl: number;
}

interface ParameterSearchOptions {
  sessionId?: string;
  workflowId?: string;
  activityName?: string;
  parameterType?: string;
  timeRange?: {
    from: number;
    to: number;
  };
}

interface ParameterPanelProps {
  sessionId?: string;
  workflowId?: string;
  isVisible: boolean;
  onClose: () => void;
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  sessionId,
  workflowId,
  isVisible,
  onClose,
}) => {
  const [parameters, setParameters] = useState<ActivityParameter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOptions, setSearchOptions] = useState<ParameterSearchOptions>({
    sessionId: sessionId,
    workflowId: workflowId,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterActivity, setFilterActivity] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('24h');

  useEffect(() => {
    if (isVisible) {
      loadParameters();
    }
  }, [isVisible, searchOptions]);

  const loadParameters = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/parameters/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...searchOptions,
          timeRange: getTimeRangeFilter(),
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setParameters(data.data.parameters);
      } else {
        setError(data.error || 'Failed to load parameters');
      }
    } catch (err) {
      setError('Network error while loading parameters');
    } finally {
      setLoading(false);
    }
  };

  const getTimeRangeFilter = () => {
    const now = Date.now();
    const ranges = {
      '1h': now - (60 * 60 * 1000),
      '24h': now - (24 * 60 * 60 * 1000),
      '7d': now - (7 * 24 * 60 * 60 * 1000),
      '30d': now - (30 * 24 * 60 * 60 * 1000),
    };
    
    return {
      from: ranges[timeRange as keyof typeof ranges] || ranges['24h'],
      to: now,
    };
  };

  const handleSearch = () => {
    const newSearchOptions: ParameterSearchOptions = {
      sessionId: searchOptions.sessionId,
      workflowId: searchOptions.workflowId,
    };

    if (filterActivity !== 'all') {
      newSearchOptions.activityName = filterActivity;
    }

    if (filterType !== 'all') {
      newSearchOptions.parameterType = filterType;
    }

    setSearchOptions(newSearchOptions);
  };

  const filteredParameters = parameters.filter(param => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      param.activityName.toLowerCase().includes(searchLower) ||
      param.workflowId.toLowerCase().includes(searchLower) ||
      param.sessionId.toLowerCase().includes(searchLower) ||
      JSON.stringify(param.value).toLowerCase().includes(searchLower)
    );
  });

  const uniqueActivities = [...new Set(parameters.map(p => p.activityName))];
  const parameterTypes = ['string', 'number', 'object', 'array', 'boolean'];

  const formatValue = (value: any, type: string) => {
    if (type === 'object' || type === 'array') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'activity_output':
        return <Activity size={16} className="text-blue-500" />;
      case 'user_input':
        return <Database size={16} className="text-green-500" />;
      case 'system_generated':
        return <Workflow size={16} className="text-purple-500" />;
      default:
        return <Database size={16} className="text-gray-500" />;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Activity Parameters
          </h2>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Search and Filter Controls */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search parameters..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select
              value={filterActivity}
              onChange={(value) => setFilterActivity(value)}
              options={[
                { value: "all", label: "All Activities" },
                ...uniqueActivities.map((activity) => ({
                  value: activity,
                  label: activity
                }))
              ]}
            />

            <Select
              value={filterType}
              onChange={(value) => setFilterType(value)}
              options={[
                { value: "all", label: "All Types" },
                ...parameterTypes.map((type) => ({
                  value: type,
                  label: type
                }))
              ]}
            />

            <Select
              value={timeRange}
              onChange={(value) => setTimeRange(value)}
              options={[
                { value: "1h", label: "Last Hour" },
                { value: "24h", label: "Last 24 Hours" },
                { value: "7d", label: "Last 7 Days" },
                { value: "30d", label: "Last 30 Days" }
              ]}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSearch} className="flex items-center gap-2">
              <Filter size={16} />
              Apply Filters
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSearchTerm('');
                setFilterActivity('all');
                setFilterType('all');
                setTimeRange('24h');
                setSearchOptions({
                  sessionId: sessionId,
                  workflowId: workflowId,
                });
              }}
            >
              Clear All
            </Button>
          </div>
        </div>

        {/* Parameter List */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading parameters...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <div className="text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

          {!loading && !error && filteredParameters.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No parameters found matching your criteria.
            </div>
          )}

          <div className="space-y-4">
            {filteredParameters.map((param, index) => (
              <div
                key={`${param.sessionId}-${param.workflowId}-${param.activityName}-${index}`}
                className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getSourceIcon(param.metadata.source)}
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {param.activityName}
                    </h3>
                    <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                      {param.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock size={14} />
                    {formatTimestamp(param.timestamp)}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Session ID
                    </label>
                    <div className="text-sm font-mono text-gray-900 dark:text-white">
                      {param.sessionId}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Workflow ID
                    </label>
                    <div className="text-sm font-mono text-gray-900 dark:text-white">
                      {param.workflowId}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Source
                    </label>
                    <div className="text-sm text-gray-900 dark:text-white capitalize">
                      {param.metadata.source.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Value
                  </label>
                  <pre className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-2 overflow-x-auto">
                    {formatValue(param.value, param.type)}
                  </pre>
                </div>

                {param.metadata.validation && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Validation
                    </label>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      Required: {param.metadata.validation.required ? 'Yes' : 'No'} |
                      Type: {param.metadata.validation.type}
                      {param.metadata.validation.min !== undefined && ` | Min: ${param.metadata.validation.min}`}
                      {param.metadata.validation.max !== undefined && ` | Max: ${param.metadata.validation.max}`}
                      {param.metadata.validation.pattern && ` | Pattern: ${param.metadata.validation.pattern}`}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>
              Showing {filteredParameters.length} of {parameters.length} parameters
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadParameters}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};