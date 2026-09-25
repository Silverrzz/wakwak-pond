import { inject } from 'vue';

export const pondKey = Symbol('pond');
export const usePond = () => inject(pondKey);
