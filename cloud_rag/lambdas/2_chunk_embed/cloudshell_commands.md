#### 1. IF you want to see vectors

**CODE:** 

```
aws s3vectors list-vectors \
  --vector-bucket-name paper-vectors-rohan-dev \
  --index-name paper-chunks \
  --max-results 100 \
  --region us-east-1
```

**OUTPUT:** 

```
{

    "vectors": [
        {
            "key": "dev-user:History_of_ML:0:f261dbf0-906e-4e72-878a-e02b61a9f9a9"
        },
        {
            "key": "dev-user:History_of_ML:2:14107446-cfd2-4a8b-a2c8-4fddd0771a6e"
        },
        {
            "key": "dev-user:History_of_ML:1:a4b8e373-7088-4247-b3f9-eb388d353347"
        },
        {
            "key": "dev-user:History_of_ML:3:a7163c6e-9b34-407c-b9e7-00c1f510d6da"
        }
    ]
}
```

#### 2. See details of a specific vector

**CODE:** 

```
aws s3vectors get-vectors \
    --vector-bucket-name paper-vectors-rohan-dev \
    --index-name paper-chunks \
    --keys <Put a vector key here that you get from above command (list_vectors)> \
    --return-data \
    --return-metadata \
    --region us-east-1
```

**OUTPUT:** 

```
{
    "vectors": [
        {
            "key": "dev-user:Cloud_Computing_Paper_Review:2:40824a9e-4813-4519-867c",
            "data": {
                "float32": [
                    -0.08365745097398758,
                    .....
                    total 256 floats because currently embedding dimension is 256
                    .....
                    0.008195606991648674
                ]
            },
            "metadata": {
                "source_text": "BigQuery tables. Import throughput reaches ∼100GB per 30 minutes, with schema definitions managed at load time. 3.2 Columnar Nested Storage Column stripes store contiguous runs of values for each field path (e.g.,Name.Language.Code), optimized for selective read and compression. Repetition levels (r) are small integers attached to every stored value indicating how deep a repetition occurred (which repeated ancestor repeated last), disambiguating which list element the value belongs to. 1 3.3 Serving Tree/Query Execution Tree Uses a root→intermediate→leaves hierarchy where the root receives SQL-like queries and rewrites them into subqueries for intermediate nodes. Leaves scan tablets in parallel and produce partial aggregates, while intermediate nodes combine partials on the way up. This hierarchical aggregation reduces network and compute bottlenecks for GROUP-BY/top-kqueries, enabling sub-second responses over trillion-row tables. Hence by utilizing columnar storage and serving tree",
                "chunk_index": 2,
                "paper_id": "Cloud_Computing_Paper_Review",
                "user_id": "dev-user"
            }
        }
    ]
}
(END)
```
