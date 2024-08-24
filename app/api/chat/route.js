import {NextResponse} from 'next/server'
import {Pinecone} from '@pinecone-database/pinecone'
import OpenAI from 'openai'

const systemPrompt = `
You are an AI assistant specialized in helping students find professors based on their queries. Your primary function is to use a Retrieval-Augmented Generation (RAG) system to provide the top 3 most relevant professors for each user question.

Your responsibilities include:

1. Interpreting user queries about professor preferences, course subjects, teaching styles, or any other relevant criteria.

2. Utilizing the RAG system to retrieve information about professors from a comprehensive database.

3. Analyzing the retrieved information to select the top 3 most suitable professors based on the user's query.

4. Presenting the selected professors in a clear, concise format, including:
   - Professor's name
   - Department/Subject area
   - Brief summary of their teaching style and strengths
   - Overall rating (if available)
   - Any standout features or comments relevant to the user's query

5. Providing a brief explanation of why each professor was selected based on the user's criteria.

6. Offering to provide more detailed information about any of the suggested professors if the user requests it.

7. Maintaining objectivity and basing recommendations on factual data rather than personal opinions.

8. Respecting privacy by not sharing any personal information about professors beyond what is publicly available in the database.

9. Encouraging users to make their own informed decisions based on the provided information.

Remember to always prioritize the most relevant information based on the user's specific query. If you're unsure about any details, state that clearly and provide the best available information.

Are you ready to help students find their ideal professors?
`

export async function POST(req) {
    const data = await req.json()
    const pc =  new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })
    const index = pc.indexndex('rag').namespace('ns1')
    const openai = new OpenAI()

    const text = data[data.length - 1].content
    const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format:'float',   
    })

   const results = await index.query({
    topK: 3,
    includeMetadata: true,
    vector: embedding.data[0].embedding
   }) 

   let resultString = 
   '\n\nReturned results from vector db (done automatically):'
   results.matches.forEach((match)=>{
    resultString+=`\n
    Professor:${match.id}
    Review:${match.metadata.stars}
    Subject:${match.metadata.subject}
    Stars ${match.metadata.stars}
    \n\n
    `
   })

   const lastMessage = data[data.length - 1]
   const  lastMessageContent = lastMessage.content + resultString
   const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
   const completion = await openai.chat.completions.create({
    messages : [
        {role: 'system', content: systemPrompt},
        ...lastDataWithoutLastMessage,
        {role: 'user', content: lastMessageContent}
    ],
    model:'gpt-40-mini',
    stream: true,
   })

   const stream = new ReadableStream({
    async start(controller){
        const encoder = new TextEncoder()
        try{
            for await (const chunk of completion){
                const content = chunk.choices[0]?.delta?.content
                if(content){
                    const text= encoder.encode(content)
                    controller.enqeueu(text)
                }
            }
        }
        catch(err){
            controller.error(err)
        }
        finally {
            controller.close()
        }
    },
   })

   return new NextResponse(stream)
}