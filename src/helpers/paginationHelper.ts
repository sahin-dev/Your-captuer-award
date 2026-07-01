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

    const page: number = Number(options.page) || 1;
    const limit: number = Number(options.limit) || 10;
    const skip: number = (Number(page) - 1) * limit;

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
    const totalPage = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPage,
        totalPages: totalPage,
        hasNextPage: page < totalPage,
        hasPreviousPage: page > 1
    }
}


export const paginationHelper = {
    calculatePagination,
    getPaginationMetaData
}