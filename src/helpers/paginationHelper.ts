type IOptions = {
    page?: number,
    limit?: number,
    sortOrder?: string,
    sortBy?: string
}

type IOptionsResult = {
    page: number,
    limit: number,
    skip: number,
    sortBy: string,
    sortOrder: string
}

type IPaginationMetaData = {
    page: number,
    limit: number,
    total: number,
    totalPage: number,
    totalPages: number,
    hasNextPage: boolean,
    hasPreviousPage: boolean
}

const calculatePagination = (options: IOptions): IOptionsResult => {
    const requestedPage = Number(options.page);
    const requestedLimit = Number(options.limit);
    const page = Number.isFinite(requestedPage) && requestedPage > 0
        ? Math.floor(requestedPage)
        : 1;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 100)
        : 10;
    const skip: number = (page - 1) * limit;

    const sortBy: string = options.sortBy || 'createdAt';
    const sortOrder: string = options.sortOrder || 'desc';

    return {
        page,
        limit,
        skip,
        sortBy,
        sortOrder
    }
}

const getPaginationMetaData = (page: number, limit: number, total: number): IPaginationMetaData => {
    const safePage = Number.isFinite(Number(page)) && Number(page) > 0
        ? Math.floor(Number(page))
        : 1;
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
        ? Math.min(Math.floor(Number(limit)), 100)
        : 10;
    const totalPage = Math.ceil(total / safeLimit);

    return {
        page:safePage,
        limit:safeLimit,
        total,
        totalPage,
        totalPages: totalPage,
        hasNextPage: safePage < totalPage,
        hasPreviousPage: safePage > 1
    }
}


export const paginationHelper = {
    calculatePagination,
    getPaginationMetaData
}
