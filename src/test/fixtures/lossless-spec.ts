/**
 * A valid OpenAPI 3.0 document using the parts of the spec the editor does not
 * edit: specification extensions (x-*) at every level, externalDocs, links,
 * callbacks, examples, encoding, parameter style/explode/content, path-item
 * fields, TRACE, untyped ("any") schemas, keywords next to compositions,
 * constraints on every kind of schema, additionalProperties / not refs and
 * discriminator mappings (by ref and by bare name).
 *
 * import -> export must reproduce it exactly (apart from `openapi: 3.0.3`).
 */
export const LOSSLESS_SPEC_YAML = `
openapi: 3.0.3
x-root-ext:
  owner: platform
info:
  title: Lossless
  version: '1.0'
  x-logo:
    url: https://example.com/logo.png
  contact:
    name: Team
    x-team-id: 7
  license:
    name: MIT
    x-spdx: MIT
externalDocs:
  url: https://example.com/docs
  description: Docs
servers:
  - url: https://{env}.example.com
    x-server-ext: true
    variables:
      env:
        default: prod
        enum: [prod, dev]
        x-var-ext: 1
tags:
  - name: pets
    externalDocs:
      url: https://example.com/pets
    x-tag-ext: 1
security:
  - oauth: [read]
paths:
  /pets:
    summary: Pets collection
    description: Path-level description
    x-path-ext: 1
    servers:
      - url: https://pets.example.com
    get:
      operationId: listPets
      tags: [pets]
      x-op-ext:
        rate: 5
      externalDocs:
        url: https://example.com/list
      servers:
        - url: https://list.example.com
      parameters:
        - name: tags
          in: query
          style: form
          explode: false
          allowReserved: true
          deprecated: true
          x-param-ext: 1
          schema:
            type: array
            items:
              type: string
            minItems: 1
        - name: filter
          in: query
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Filter'
              example:
                kind: cat
        - name: X-Rate
          in: header
          examples:
            low:
              value: 1
            high:
              value: 100
          schema:
            type: integer
      responses:
        '200':
          description: ok
          x-response-ext: 1
          headers:
            X-Next:
              description: next page
              style: simple
              x-header-ext: 1
              schema:
                type: string
          links:
            next:
              operationId: listPets
              parameters:
                cursor: $response.header.X-Next
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
              examples:
                one:
                  $ref: '#/components/examples/OnePet'
              x-media-ext: 1
            application/pdf: {}
    trace:
      operationId: tracePets
      responses:
        '200':
          description: ok
    post:
      operationId: createPet
      requestBody:
        description: new pet
        required: true
        x-body-ext: 1
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                photo:
                  type: string
                  format: binary
            encoding:
              photo:
                contentType: image/png
      callbacks:
        onEvent:
          '{$request.body#/callbackUrl}':
            post:
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
              responses:
                '200':
                  description: ok
      responses:
        '201':
          description: created
components:
  x-components-ext: 1
  examples:
    OnePet:
      value:
        - id: 1
  schemas:
    Any: {}
    Untyped:
      properties:
        a:
          type: string
    UntypedArray:
      items:
        type: string
    UntypedEnum:
      enum: [a, b]
    Filter:
      type: object
      properties:
        kind:
          type: string
    Pet:
      allOf:
        - $ref: '#/components/schemas/Base'
      type: object
      properties:
        name:
          type: string
          description: Pet name
      required: [name]
      description: A pet
    Base:
      type: object
      properties:
        id:
          type: integer
          format: int64
        petType:
          type: string
      discriminator:
        propertyName: petType
        mapping:
          pet: '#/components/schemas/Pet'
    Choice:
      oneOf:
        - $ref: '#/components/schemas/Pet'
        - $ref: '#/components/schemas/Base'
      discriminator:
        propertyName: petType
        mapping:
          pet: Pet
          base: '#/components/schemas/Base'
    Code:
      type: string
      enum: [a, b]
      maxLength: 1
      pattern: '^[ab]$'
    Tags:
      type: array
      items:
        type: string
      minItems: 1
      minimum: 1
      format: csv
    Dict:
      type: object
      additionalProperties:
        $ref: '#/components/schemas/Pet'
      minimum: 0
    NotPet:
      not:
        $ref: '#/components/schemas/Pet'
    Mixed:
      oneOf:
        - type: string
        - type: integer
      minLength: 2
      format: mixed
  securitySchemes:
    oauth:
      type: oauth2
      x-scheme-ext: 1
      flows:
        x-flows-ext: 1
        clientCredentials:
          tokenUrl: https://example.com/token
          x-flow-ext: 1
          scopes:
            read: Read
`;
