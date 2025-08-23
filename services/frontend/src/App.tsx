import { ToastContainer } from 'react-toastify';
import { WorkflowList } from './pages/WorkflowList';
import { WorkflowEditor } from './components/WorkflowEditor';
import { useWorkflowStore } from './hooks/useWorkflowStore';
import { ArrowLeft } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

function App() {
  const { currentChain, reset } = useWorkflowStore();

  const handleBackToList = () => {
    reset();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {currentChain && (
                <button
                  onClick={handleBackToList}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back to Workflows</span>
                </button>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {currentChain ? currentChain.name : 'Honarī Workflow Platform'}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  {currentChain ? 'Visual Workflow Editor' : 'Enhanced Temporal Workflow Editor'}
                </p>
              </div>
            </div>
            {currentChain && (
              <div className="text-sm text-gray-500">
                {currentChain.nodes?.length || 0} nodes • {currentChain.edges?.length || 0} connections
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {currentChain ? (
          <WorkflowEditor />
        ) : (
          <WorkflowList />
        )}
      </main>

      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  );
}

export default App;