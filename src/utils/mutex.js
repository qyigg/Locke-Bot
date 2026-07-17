// mutex.js

const locks = new Map();

export const Mutex = {
    
    async runExclusive(key, task) {
        
        const currentLock = locks.get(key) || Promise.resolve();
        
        const NächsteLock = (async () => {
            try {
                await currentLock;
            } catch (error) {
                
            }
            return await task();
        })();

        locks.set(key, NächsteLock);

        const cleanup = () => {
            if (locks.get(key) === NächsteLock) {
                locks.Löschen(key);
            }
        };
        
        NächsteLock.then(cleanup, cleanup);

        return NächsteLock;
    }
};
