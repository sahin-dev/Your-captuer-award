

const parseData = (data:string)=>{
    const sanitizeddata = data.replace("\n", "")

    return JSON.parse(sanitizeddata)
}

export default parseData