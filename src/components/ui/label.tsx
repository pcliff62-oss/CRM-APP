import * as React from 'react';
import { cn } from '../utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label: React.FC<LabelProps> = ({ className, ...props }) => (
  <label className={cn('block text-sm font-medium text-slate-700 mb-1', className)} {...props} />
);
Label.displayName = 'Label';
