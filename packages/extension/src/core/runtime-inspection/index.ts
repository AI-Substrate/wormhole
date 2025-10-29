/**
 * Runtime Inspection Module
 *
 * Public API for debug session inspection and variable exploration.
 * Export all interfaces and classes needed by debug scripts.
 */

// Interfaces
export {
    IDebugAdapter,
    IDebugCapabilities,
    IVariableData,
    IVariablePresentationHint,
    IListVariablesParams,
    ISetVariableParams,
    ISetVariableResult,
    IVariableChildrenParams,
    IStreamVariablesParams,
    IStreamResult
} from './interfaces';

// Memory budget
export {
    IMemoryBudget,
    MemoryBudget
} from './MemoryBudget';

// Base adapter
export {
    BaseDebugAdapter
} from './adapters/BaseDebugAdapter';

// Adapter factory
export {
    AdapterFactory
} from './AdapterFactory';

// Service
export {
    RuntimeInspectionService
} from './RuntimeInspectionService';
