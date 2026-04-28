export interface CommonResponse<T = any> {
  status: boolean;
  message: string;
  data: T;
  errors?: any; // Or a more specific error type
}

export interface PaginatedResponse<T> {
  status: boolean;
  message: string;
  data: T[];
  pagination: {
    current_page: number;
    page_size: number;
    total_records: number;
    total_pages: number;
  };
  errors?: any;
}

export interface CursorPaginatedResponse<T> {
  status: boolean;
  message: string;
  data: {
    items: T[];
    next_cursor_id?: string;
  };
  errors?: any;
}