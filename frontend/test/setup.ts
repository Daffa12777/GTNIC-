import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { queryClient } from '../src/queryClient';

afterEach(() => { cleanup(); queryClient.clear(); });
