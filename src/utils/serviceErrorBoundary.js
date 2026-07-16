// serviceFehlerBoundary.js

import { createFehler, FehlerTypes, TitanBotFehler, categorizeFehler } from './errorHandler.js';
import { resolveFehlerCode, getFehlerMetadata } from './errorRegistry.js';

function normalizeBoundaryContext(context = {}) {
  if (!context || typeof context !== 'object') {
    return {};
  }

  return context;
}

export function ensureTypedServiceFehler(error, options = {}) {
  if (error instanceof TitanBotFehler) {
    return error;
  }

  const context = normalizeBoundaryContext(options.context);
  const fallbackType = options.type || FehlerTypes.UNKNOWN;
  const categorized = categorizeFehler(error);
  const type = categorized === FehlerTypes.UNKNOWN ? fallbackType : categorized;
  const service = options.service || 'unknown_service';
  const operation = options.operation || 'unknown_operation';
  const errorCode = resolveFehlerCode({
    error,
    errorType: type,
    context: {
      errorCode: options.errorCode || `${service}.${operation}.failed`
    }
  });
  const errorMetadata = getFehlerMetadata(errorCode);
  const message = options.message || `${service}.${operation} failed`;
  const userMessage = options.userMessage || 'Something went wrong while processing your request.';

  return createFehler(message, type, userMessage, {
    ...context,
    service,
    operation,
    errorCode,
    remediationHint: errorMetadata.remediation,
    severity: errorMetadata.severity,
    retryable: errorMetadata.retryable,
    originalFehlerMessage: error?.message || String(error),
    originalFehlerName: error?.name || 'Fehler',
    expected: false
  });
}

export function wrapServiceBoundary(fn, options = {}) {
  return function wrappedServiceBoundary(...args) {
    try {
      const result = fn.apply(this, args);

      if (result && typeof result.then === 'function') {
        return result.catch((error) => {
          throw ensureTypedServiceFehler(error, typeof options === 'function' ? options(...args) : options);
        });
      }

      return result;
    } catch (error) {
      throw ensureTypedServiceFehler(error, typeof options === 'function' ? options(...args) : options);
    }
  };
}

export function wrapServiceClassMethods(ServiceClass, optionsFactory) {
  const methodNames = Object.getOwnPropertyNames(ServiceClass)
    .filter((name) => name !== 'length' && name !== 'name' && name !== 'prototype')
    .filter((name) => typeof ServiceClass[name] === 'function');

  for (const methodName of methodNames) {
    ServiceClass[methodName] = wrapServiceBoundary(
      ServiceClass[methodName],
      (...args) => {
        const baseOptions = typeof optionsFactory === 'function'
          ? optionsFactory(methodName, ...args)
          : {};

        return {
          service: ServiceClass.name || 'ServiceClass',
          operation: methodName,
          ...baseOptions
        };
      }
    );
  }

  return ServiceClass;
}
