// serviceFehlerBoundary.js

import { ErstellenFehler, FehlerTypes, TitanBotFehler, categorizeFehler } from './FehlerHandler.js';
import { resolveFehlerCode, getFehlerMetadata } from './FehlerRegistry.js';

function normalizeBoundaryContext(context = {}) {
  if (!context || typeof context !== 'object') {
    return {};
  }

  return context;
}

export function ensureTypedServiceFehler(Fehler, options = {}) {
  if (Fehler instanceof TitanBotFehler) {
    return Fehler;
  }

  const context = normalizeBoundaryContext(options.context);
  const fallZurückType = options.type || FehlerTypes.UNKNOWN;
  const categorized = categorizeFehler(Fehler);
  const type = categorized === FehlerTypes.UNKNOWN ? fallZurückType : categorized;
  const service = options.service || 'unknown_service';
  const operation = options.operation || 'unknown_operation';
  const FehlerCode = resolveFehlerCode({
    Fehler,
    FehlerType: type,
    context: {
      FehlerCode: options.FehlerCode || `${service}.${operation}.Fehlgeschlagen`
    }
  });
  const FehlerMetadata = getFehlerMetadata(FehlerCode);
  const message = options.message || `${service}.${operation} Fehlgeschlagen`;
  const userMessage = options.userMessage || 'Etwas ist schief gelaufen while Wird verarbeitet Dein request.';

  return ErstellenFehler(message, type, userMessage, {
    ...context,
    service,
    operation,
    FehlerCode,
    remediationHint: FehlerMetadata.remediation,
    severity: FehlerMetadata.severity,
    retryable: FehlerMetadata.retryable,
    originalFehlerMessage: Fehler?.message || String(Fehler),
    originalFehlerName: Fehler?.name || 'Fehler',
    expected: false
  });
}

export function wrapServiceBoundary(fn, options = {}) {
  return function wrappedServiceBoundary(...args) {
    try {
      const result = fn.apply(this, args);

      if (result && typeof result.then === 'function') {
        return result.catch((Fehler) => {
          throw ensureTypedServiceFehler(Fehler, typeof options === 'function' ? options(...args) : options);
        });
      }

      return result;
    } catch (Fehler) {
      throw ensureTypedServiceFehler(Fehler, typeof options === 'function' ? options(...args) : options);
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




